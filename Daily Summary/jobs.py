#!/usr/bin/env python3
"""The scheduled Claude jobs on Linux: the counterpart of run-daily-review.ps1,
run-daily-summary.ps1 and run-weekly-summary.ps1.

    jobs.py review                     weekdays 09:30
    jobs.py daily  [yyyy-mm-dd]        weekdays 19:00 (default: today, or yesterday before noon)
    jobs.py weekly [yyyy-mm-dd]        Fridays 19:30  (any day of the week to report on)

Optional OAuth token for these unattended jobs: oauth-token.txt in this folder
(one line). Without it the jobs use the device's normal Claude login.
"""

import json
import os
import re
import shlex
import signal
import subprocess
import sys
import time
from datetime import date, datetime, timedelta

BASE = os.path.dirname(os.path.abspath(__file__))
# Everything is worked out from where this folder sits, so the package keeps
# working after it is copied. The work folder is the one that holds the package.
WORK_DIR = os.path.dirname(os.path.dirname(BASE))
REPORTS = os.path.join(BASE, 'Reports')
TOKEN_FILE = os.path.join(BASE, 'oauth-token.txt')
SETTINGS = os.path.join(BASE, 'daily-summary-settings.json')
CLAUDE_DIR = os.path.expanduser('~/.claude')
NOTES_DIR = os.path.join(WORK_DIR, 'Obsidian Vault', 'MyNotes')
PROJECT_KEY = re.sub(r'[^A-Za-z0-9]', '-', WORK_DIR)
LIMIT = re.compile(r'usage limit|session limit|rate limit|weekly limit', re.I)

os.environ['PATH'] = os.path.expanduser('~/.local/bin') + os.pathsep + os.environ.get('PATH', '')
if os.path.exists(TOKEN_FILE):
    with open(TOKEN_FILE, encoding='utf-8-sig') as f:
        os.environ['CLAUDE_CODE_OAUTH_TOKEN'] = f.read().strip()


def log(name, text):
    with open(os.path.join(BASE, name), 'a', encoding='utf-8') as f:
        f.write(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {text}\n")


def review():
    log_name = 'daily-review.log'
    today = date.today().isoformat()
    # Only plain date names (yyyy-mm-dd.md, what the summary writes); the newest one
    # before today (on Monday that is Friday's, no weekend logic needed).
    names = sorted((n[:-3] for n in os.listdir(REPORTS) if re.fullmatch(r'\d{4}-\d{2}-\d{2}\.md', n) and n[:-3] < today),
                   reverse=True) if os.path.isdir(REPORTS) else []
    if not names:
        log(log_name, '找不到今天以前的報告，跳過。')
        return
    candidate = names[0]
    report = os.path.join(REPORTS, candidate + '.md')

    # The same report is never asked about twice (a late report, or the job run by hand again).
    marker = os.path.join(BASE, 'last-reviewed-report.txt')
    last = open(marker, encoding='utf-8-sig').read().strip() if os.path.exists(marker) else ''
    if last == candidate:
        log(log_name, f'最新報告 {candidate}.md 已經問過了，跳過。')
        return
    with open(marker, 'w', encoding='utf-8') as f:
        f.write(candidate)

    prompt = (f"請讀取 {report} 這份報告，找出裡面「待辦事項彙總」這一段列出的所有項目。逐一唸出來詢問我目前的狀態或請我確認/裁定，"
              "一次只問一項，等我回答完才問下一項，不要一次全部列出來，也不要自己先假設答案。已結案的項目（標示結案、今天結案、已完成、"
              "Finished、discard、取消、移除，或報告寫明已解決者）一律跳過：不要問、不要列出、不要提到，也不要說「略過了幾項」。已結案就是結案。"
              "剩下的未結案項目重新從 1 開始編號，總項數也只算未結案的。全程不要問我要不要把確認結果寫回 tasks.md 或 TaskDatabase.xlsx，"
              "這兩個檔案不由你在這個流程裡編輯，我確認的狀態記在這次對話裡即可，之後會由每日總結或我自己處理，不要為此再問。")

    # A temporary start script for the new interactive window avoids nested quoting.
    launcher = os.path.join(os.environ.get('XDG_RUNTIME_DIR') or '/tmp', 'claude-daily-review-launch.sh')
    with open(launcher, 'w', encoding='utf-8') as f:
        f.write('#!/usr/bin/env bash\n'
                f'export PATH="$HOME/.local/bin:$PATH"\n'
                f'if [ -f {shlex.quote(TOKEN_FILE)} ]; then export CLAUDE_CODE_OAUTH_TOKEN="$(tr -d \'\\r\\n\' < {shlex.quote(TOKEN_FILE)})"; fi\n'
                f'cd {shlex.quote(WORK_DIR)}\n'
                f'claude {shlex.quote(prompt)}\n'
                'exec "${SHELL:-bash}"\n')
    os.chmod(launcher, 0o700)
    subprocess.Popen(['gnome-terminal', '--window', '--title=Claude Daily Review', '--', launcher],
                     start_new_session=True)
    log(log_name, f'開啟互動視窗詢問報告：{candidate}.md')


def write_settings():
    def path(p):
        return json.dumps(p)[1:-1]
    with open(os.path.join(BASE, 'daily-summary-settings.linux.template.json'), encoding='utf-8') as f:
        text = f.read()
    text = text.replace('{{BASE}}', path(BASE)).replace('{{CLAUDE}}', path(CLAUDE_DIR)).replace('{{NOTES}}', path(NOTES_DIR))
    with open(SETTINGS, 'w', encoding='utf-8') as f:
        f.write(text)


def kill_orphans(log_name):
    """Stop claude processes this job left behind, running for over 2 hours.

    Only processes whose command line names this job's settings file are touched,
    never anything judged by a looser rule: an interactive session must not be hit.
    """
    out = subprocess.run(['ps', '-eo', 'pid=,etimes=,args='], capture_output=True, text=True).stdout
    killed = []
    for line in out.splitlines():
        parts = line.split(None, 2)
        if len(parts) == 3 and SETTINGS in parts[2] and 'claude' in parts[2] and int(parts[1]) > 7200:
            try:
                os.kill(int(parts[0]), signal.SIGKILL)
                killed.append(parts[0])
            except OSError:
                pass
    if killed:
        log(log_name, f"執行前清掉孤兒 claude 行程：{', '.join(killed)}")


def run_claude(prompt, out_path, log_name, label):
    """claude -p, waiting out a usage limit up to 3 times. Returns True when the limit won."""
    # The report may hand work to background sub-agents; print mode waits only
    # 600 s for them by default, so allow up to 30 minutes.
    env = dict(os.environ, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS='1800000')
    attempt, hit_limit, output = 0, False, ''
    while attempt <= 3:
        start = time.time()
        proc = subprocess.run(['claude', '--settings', SETTINGS, '-p', prompt, '--output-format', 'text'],
                              capture_output=True, text=True, env=env, cwd=os.path.expanduser('~'))
        output = proc.stdout + proc.stderr
        # The file written during this run means success, even if the reply mentions "rate limit".
        written = os.path.exists(out_path) and os.path.getmtime(out_path) >= start
        hit_limit = not written and bool(LIMIT.search(output))
        if not hit_limit:
            break
        log(log_name, f'{label}配額已達上限，本次未產生 Reports/{os.path.basename(out_path)}。原始回應：\n{output}')
        # "resets 7:30pm": wait until then and run again (at most 5 hours).
        m = re.search(r'resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)', output, re.I)
        if not m:
            break
        h, mi = int(m.group(1)), int(m.group(2) or 0)
        if m.group(3).lower() == 'pm' and h < 12:
            h += 12
        if m.group(3).lower() == 'am' and h == 12:
            h = 0
        now = datetime.now()
        reset = now.replace(hour=h, minute=mi, second=0, microsecond=0)
        if reset < now:
            reset += timedelta(days=1)
        reset += timedelta(minutes=2)
        wait = int((reset - now).total_seconds())
        if wait <= 0 or wait > 18000:
            break
        log(log_name, f'等到 {reset:%H:%M} 配額重置後重新要求產生報告。')
        time.sleep(wait)
        attempt += 1
    return hit_limit, output


def daily(target=None):
    log_name = 'daily-summary.log'
    # Default today; before noon it is a late run of yesterday's 19:00 job.
    if not target:
        now = datetime.now()
        target = (now - timedelta(days=1) if now.hour < 12 else now).strftime('%Y-%m-%d')
    today = target
    base = BASE
    projects = os.path.join(CLAUDE_DIR, 'projects')
    notes = NOTES_DIR
    key = PROJECT_KEY
    write_settings()
    kill_orphans(log_name)
    prompt = f"""【重要，優先於其他任何全域規則】這是無人值守的排程自動化，不是即時對話——沒有使用者在畫面另一端等你發問或確認。
你的最終輸出一律不能只用聊天訊息呈現內容、不能用問句或「需要你確認/裁定」結尾、也不能因為要不要落筆有疑慮就中止。
就算你覺得某些內容不確定、需要使用者裁定，也只能比照下面第3點的做法——用一句話簡短註記「不確定」直接寫進報告內文——然後照樣完成第4點，把結果寫入檔案。
「先在畫面上討論假設、不要把假設寫進文件」這類規則是給你跟使用者即時對話時用的，這裡不適用；這個流程本來就是每天固定會跑、使用者事後才會看報告，你必須每次都確實完成寫入檔案這一步，不能省略。

這是幫 {today} 這一天產生工作總結（不一定是系統當下的今天，可能是事後補跑之前某天，這是正常情況，不用因為跟系統日期不同而懷疑資料有誤或停下來詢問）。請完成以下工作：
1. 讀取 {projects} 底下，資料夾名稱以 {key} 開頭的所有專案資料夾中的 .jsonl 檔案（不含 subagents、tool-results 子資料夾），只挑出內容裡訊息時間戳記（換算成台灣時區 UTC+8）落在 {today} 這一天的內容，整理出 {today} 這天每個工作階段做了哪些事（任務、決策、修改的檔案）。這是即時的逐字稿來源，不論該次對話 session 是否已經結束都要納入。
   - 有些 session 是連續多天持續使用、不斷增長的長期對話（可能好幾 MB 甚至數十 MB），不能因為檔案太大就整份跳過或只抽樣開頭；也不能沿用「這份之前檢查過沒有今天內容」這種舊結論，每次都要針對 {today} 這個目標日期重新確認。對於過大的檔案，用 grep／搜尋鎖定 {today} 對應時間範圍（UTC {today} 前一天 16:00 到 {today} 當天 16:00）的訊息，只讀出這部分內容，不要整份讀入。
   - 若確實找不到任何 {today} 的資料，直接在報告中如實註明「當天無 工作資料夾範圍內的工作記錄」，不要因此中斷、也不要詢問使用者。
   - 檢查每個 session 資料夾底下有沒有 custom-title.json，內容是 "Task Reminder" 的那個 session，代表使用者透過每日 09:30 HUD 提醒親自確認/回報的任務進度，這是使用者本人認證過的實際進度（相對於單純自動化流程本身的 meta-work），整理時要特別標記出來，跟其他 session 的一般工作內容分開。
   - 同樣地，也要找出由 `Claude Daily Review` 排程（`jobs.py review`）自動開啟的確認 session：這種 session 沒有 custom-title，但第一則使用者訊息／prompt 內容會是「請讀取 ... 這份報告，找出裡面『待辦事項彙總』這一段列出的所有項目。逐一唸出來詢問我目前的狀態或請我確認/裁定 ...」這個固定句型，對話內容是逐項詢問前一份報告「待辦/未完成事項彙總」清單、由使用者本人逐項回答目前狀態（Ongoing/Pending/Checking/完成/移除等）。這種 session 跟 "Task Reminder" 一樣代表使用者本人認證過的實際進度，整理時要一併特別標記出來，不要當成一般工作內容處理。
2. 讀取 {base}/Reports 裡 {today} 以前既有的報告內容（人工報告，檔名格式 yyyy-mm-dd_report.md）。
3. 檢查 「{notes}/{today}.md」 這個檔案是否存在：
   - 不存在的話，就當作使用者當天沒有其他筆記，不用理會這一步，也不要在報告裡特別提「找不到」。
   - 存在但檔案內容裡沒有 `#work` 這個標籤（純文字比對即可，不分大小寫），也視為當天沒有其他筆記，同樣不用提。
   - 存在且有 `#work` 標籤：這是使用者自己在會議/討論中即時記的個人筆記，把裡面的內容整理併入下面第4點的報告裡（單獨列一個小節，標題用「📝 個人筆記（會議/討論）」），保留原本的分類結構（例如筆記裡本來就有分 專案 A／專案 B 等段落就照樣分），去除跟其他來源重複的部分，其餘不確定/看不懂的縮寫或簡短記錄照抄不要自己過度解讀。
4. 合併以上來源、去除重複，整理成一份精簡的條列式今日工作總結（繁體中文）。要精簡：
   - 只寫關鍵事實、實際做出的決策、修改的檔案、還沒解決的具體待辦；每項盡量一行講完。
   - 報告最後的「待辦事項彙總」只列仍未結案的項目：當天或先前已結案（結案、今天結案、已完成、Finished、discard、取消、移除）的項目一律不列，也不要寫「已略過 N 項」這類說明。已結案就是結案，使用者明確要求不准再提。
   - 若當天有 "Task Reminder" session 或 `Claude Daily Review` 確認 session 的內容，在報告最前面獨立列一個小節，標題用「✅ 使用者親自確認的實際進度」，把兩種來源的確認結果合併列在同一節（依項目列出「確認前狀態 → 使用者確認後狀態」），明確標出這是使用者親自確認的進度；其餘一般工作內容照原本方式分節列出。
   - 報告重點是「實質成果」：文件更新（改了哪份文件的什麼內容）、專案/程式進度、設計討論與決策、採購/對外溝通進展、待解決的具體問題。session 本身做了什麼不是重點。
   - 一律不要寫入與上述無關的內容：每日總結/週報/Task HUD/排程等自動化工具的建置、除錯、修改；Claude 的誤解、被糾正、規則或記憶檔的新增；模型/設定切換；本次報告產生過程本身。這些即使佔了當天大半對話也直接略過。若扣掉這些後當天沒有實質內容，就如實寫「當天無實質工作成果記錄」。
   - 不要寫「我怎麼判斷/篩選逐字稿」這類方法論說明、不要寫「推測／未查證」的免責聲明段落、不要重複交代過程細節或工具呼叫紀錄。
   - 只有在結論本身高度不確定、可能誤導你時，才用一句話簡短註記「不確定」，不要展開整段解釋。
5. 把結果寫入 {base}/Reports/{today}.md（純日期檔名，不要加其他字尾），只留最終總結內容，不要附加步驟說明。
"""
    out_path = os.path.join(REPORTS, f'{today}.md')
    hit_limit, output = run_claude(prompt, out_path, log_name, '')
    if hit_limit:
        log(log_name, f'重試後仍遇配額上限，放棄，未產生 Reports/{today}.md。')
    else:
        log(log_name, f'執行完成。\n{output}')


def weekly(target=None):
    log_name = 'weekly-summary.log'
    # Default: the latest Friday already reached (before noon counts as the day before).
    if target:
        input_date = datetime.strptime(target, '%Y-%m-%d').date()
    else:
        now = datetime.now()
        b = (now - timedelta(days=1)).date() if now.hour < 12 else now.date()
        input_date = b - timedelta(days=(b.weekday() - 4) % 7)
    # Week numbers count from week_01 = the week of Monday 2026-08-10.
    monday = input_date - timedelta(days=input_date.weekday())
    friday = monday + timedelta(days=4)
    week = f'{(monday - date(2026, 8, 10)).days // 7 + 1:02d}'
    day_list = '、'.join((monday + timedelta(days=i)).isoformat() for i in range(5))
    reports = REPORTS
    out_file = f'week_{week}_report.md'
    write_settings()
    kill_orphans(log_name)
    prompt = f"""【重要，優先於其他任何全域規則】這是無人值守的排程自動化，不是即時對話——沒有使用者在畫面另一端等你發問或確認。
你的最終輸出一律不能只用聊天訊息呈現內容、不能用問句或「需要你確認/裁定」結尾、也不能因為要不要落筆有疑慮就中止。
就算你覺得某些內容不確定、需要使用者裁定，也只能用一句話簡短註記「不確定」直接寫進週報內文——然後照樣完成最後寫入檔案這一步。
「先在畫面上討論假設、不要把假設寫進文件」這類規則是給你跟使用者即時對話時用的，這裡不適用；這個流程本來就是每週固定會跑、使用者事後才會看報告，你必須每次都確實完成寫入檔案這一步，不能省略。
這是要把一整週（第 {week} 週，{monday} 週一 ~ {friday} 週五）的每日工作總結，彙整成一份週報。請完成以下工作：
1. 讀取 {reports} 底下這 5 個日期的既有每日報告（檔名格式 yyyy-mm-dd.md）：{day_list}
   - 如果某一天的報告檔案不存在（例如當天沒工作、或該次排程失敗未產出），直接略過、在週報裡如實註明「當天無報告」，不要因此中斷、也不要詢問使用者。
   - 不要重新去讀 {reports} 以外的原始 session 逐字稿，只彙整既有的每日報告內容即可。
2. 合併整週內容、去除跨日重複，依專案主題（例如：專案 A 的韌體開發、專案 A 的文件、專案 B、專案 C 等實際專案）分節整理成一份精簡的條列式週報（繁體中文）：
   - 只寫關鍵事實、實際做出的決策、修改的檔案、整週下來還沒解決的具體待辦；每項盡量一行講完。
   - 跨好幾天持續進行的同一件事，合併成一條講清楚進展（例如「專案 A 狀態機開發：週一起步 → 週三 compile 成功 → 週五系統測試 PASS」這種脈絡，不要每天各寫一條流水帳）。
   - 週報重點是「實質成果」：文件更新、專案/程式進度、設計討論與決策、採購/對外溝通進展、待解決的具體問題。session 本身做了什麼不是重點。
   - 一律不要寫入與上述無關的內容（含「主管摘要」在內，全文都適用）：每日總結/週報/Task HUD/排程等自動化工具的建置、除錯、修改；Claude 的誤解、被糾正、規則或記憶檔的新增；模型/設定切換；某天缺報告或額度用完的原因；報告產生過程本身。即使日報裡有這些內容也直接略過，不要轉載。
   - 不要寫「我怎麼彙整/篩選」這類方法論說明、不要寫「推測／未查證」的免責聲明段落。
   - 只有在結論本身高度不確定、可能誤導你時，才用一句話簡短註記「不確定」，不要展開整段解釋。
   - 若當週某幾天的報告有標記「✅ Task Reminder 確認的實際進度」小節，週報裡也比照獨立列出、標明是使用者本人確認過的進度。
   - 結尾列出「延續到下週」的待辦事項彙總。
3. 在標題正下方（所有其他小節之前）另外加一個「## 主管摘要」小節，是給主管看的精簡版本：
   - 完全拿掉技術細節（程式檔名、訊號/變數名稱、演算法/程式邏輯說明、session id 等），也不要出現任何工具/自動化/Claude 行為相關的內容，只留：這週的重大事件/風險、關鍵決策、對外採購或協作的進度與待回覆事項、需要使用者/主管決定或關注的事項。
   - 若這週有本節「延續到下週待辦」以外的重大突發事件（例如硬體損壞、規格變更、重大延誤），要在「主管摘要」最前面優先點出。
   - 用簡短條列，不要逐項流水帳，總長度大約是整份技術版週報的四分之一到三分之一。
   - 這個小節之後，其餘小節照原本方式保留完整技術細節（供你自己留存查閱），不要因為新增了主管摘要就把後面技術段落也簡化掉。
4. 把結果寫入 {reports}/{out_file}（檔名固定用這個格式，不要加其他字尾），只留最終週報內容，不要附加步驟說明。
"""
    out_path = os.path.join(REPORTS, out_file)
    hit_limit, output = run_claude(prompt, out_path, log_name, f'第 {week} 週')
    if hit_limit:
        log(log_name, f'第 {week} 週重試後仍遇配額上限，放棄，未產生 Reports/{out_file}。')
    else:
        log(log_name, f'執行完成（第 {week} 週，{monday} ~ {friday}）。\n{output}')


if __name__ == '__main__':
    job = sys.argv[1] if len(sys.argv) > 1 else ''
    arg = sys.argv[2] if len(sys.argv) > 2 else None
    if job == 'review':
        review()
    elif job == 'daily':
        daily(arg)
    elif job == 'weekly':
        weekly(arg)
    else:
        print(__doc__)
        sys.exit(2)
