"""Background activity — an ordinary working day.

Finding an attack in a file that contains only the attack proves nothing.
This is what the attack has to hide inside.

One detail matters more than it looks: two or three users are admins with
genuinely heavy activity. Without them "unusual volume" alone identifies the
attack, and detection looks better than it is.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

DEPARTMENTS = ["Accounts", "Registrar", "IT", "Library", "Admissions",
               "Examinations", "Facilities"]

FIRST_NAMES = ["priya", "rahul", "meera", "arjun", "kavya", "vikram", "ananya",
               "rohit", "divya", "sanjay", "neha", "amit", "pooja", "kiran",
               "manish", "swati", "deepak", "anjali", "harsh", "ritu",
               "gaurav", "shreya", "nikhil", "tara", "varun"]

SERVERS = ["DC-01", "FILESERVER-01", "MAIL-RELAY"]

BENIGN_DOMAINS = ["update.microsoft.com", "portal.university.edu",
                  "cdn.jsdelivr.net", "login.microsoftonline.com",
                  "moodle.university.edu", "api.github.com"]

BENIGN_PROCS = ["chrome.exe", "outlook.exe", "excel.exe", "winword.exe",
                "teams.exe", "explorer.exe", "svchost.exe", "code.exe"]

BENIGN_FILES = ["budget_q3.xlsx", "minutes.docx", "timetable.pdf",
                "attendance.csv", "syllabus.docx", "invoice_2451.pdf"]

# ── the long tail ───────────────────────────────────────────────────────
# The eight processes above are what a *tidy* environment looks like, and a
# tidy environment makes anomaly detection look far better than it is: the
# attack is the only rare thing, so "rare" and "malicious" mean the same
# word. Real estates have a tail — somebody installs a PDF tool, IT runs a
# script, a password gets fat-fingered, finance signs into a new SaaS
# portal. All of it is unusual. Almost none of it is an attack.
#
# The tail is here so that the anomaly baseline surfaces twenty or thirty
# oddities a run and the model has to be right about which of them matter.
# Without it the detection assist would be reviewing a list containing only
# the answer.

RARE_PROCS = ["7z.exe", "notepad++.exe", "python.exe", "git.exe", "putty.exe",
              "vlc.exe", "zoom.exe", "anydesk.exe", "msiexec.exe",
              "curl.exe", "robocopy.exe", "certutil.exe"]

IT_PROCS = ["powershell.exe", "wmic.exe", "psexec.exe", "reg.exe"]

RARE_PARENTS = ["cmd.exe", "powershell.exe", "msiexec.exe", "services.exe"]

NEW_SAAS = ["api.zoom.us", "vendor-portal.example.net", "files.dropbox.com",
            "sso.newvendor.io", "cdn.fontawesome.com", "grades.examboard.in"]

# Ordinary external addresses. Rare individually, benign collectively.
def _rare_ip(rng: random.Random) -> str:
    return f"{rng.choice([13, 20, 52, 104, 151])}.{rng.randint(2, 250)}." \
           f"{rng.randint(2, 250)}.{rng.randint(2, 250)}"


def build_population(hosts: int = 12, users: int = 25, seed: int = 7) -> dict:
    rng = random.Random(seed)
    host_ids = [f"WORKSTATION-{i:02d}" for i in range(1, hosts + 1)]
    people = []
    for i, name in enumerate(FIRST_NAMES[:users]):
        people.append({
            "id": name,
            "host": host_ids[i % len(host_ids)],
            # The one colleague whose machine this person occasionally uses.
            # Fixed per person, so the borrowing relationship is a stable
            # fact about the organisation rather than a random edge.
            "buddy_host": host_ids[(i + 1) % len(host_ids)],
            "department": DEPARTMENTS[i % len(DEPARTMENTS)],
            # a small number of naturally noisy admins
            "multiplier": 3.0 if i in (2, 11, 19) else rng.uniform(0.7, 1.3),
            "is_admin": i in (2, 11, 19),
        })
    return {"hosts": host_ids, "users": people, "servers": SERVERS}


_POP = build_population()


def generate_window(start: datetime, minutes: int, hosts: int, users: int,
                    run_id: str, density: float = 1.0) -> list[dict]:
    """Events for a slice of the working day.

    `density` scales volume down during attack steps so the interface stays
    readable while still burying the attack in noise.
    """
    rng = random.Random(f"{run_id}:{start.isoformat()}")
    events: list[dict] = []
    hour = start.hour

    # nights and weekends run at a fraction of daytime volume
    daytime = 8 <= hour <= 19
    base_rate = (14 if daytime else 2) * density

    for person in _POP["users"]:
        n = max(0, int(rng.gauss(base_rate * person["multiplier"] * minutes / 10,
                                 base_rate * 0.4)))
        for _ in range(n):
            ts = start + timedelta(seconds=rng.uniform(0, minutes * 60))
            events.append(_one(rng, person, ts, run_id))

    events.sort(key=lambda e: e["ts"])
    for i, ev in enumerate(events):
        ev["event_id"] = f"evt_{run_id}_n{start.strftime('%H%M')}_{i:05d}"
    return events


def _one(rng: random.Random, person: dict, ts: datetime, run_id: str) -> dict:
    base = {"ts": ts, "run_id": run_id, "synthetic": True,
            "actor_user": person["id"], "src_host": person["host"],
            "raw_ref": "generated#noise", "untrusted": {}}

    # ~4% of activity is unusual and entirely innocent. This is the tail the
    # anomaly baseline will flag and the model has to correctly ignore.
    if rng.random() < 0.04:
        return _uncommon(rng, person, base)

    kind = rng.choices(
        ["dns", "auth", "file", "proc", "net"],
        weights=[40, 15, 22, 15, 8], k=1)[0]

    if kind == "dns":
        return {**base, "source": "network", "class_name": "network_activity",
                "domain": rng.choice(BENIGN_DOMAINS), "outcome": "resolved",
                "untrusted": {"dns_query": rng.choice(BENIGN_DOMAINS),
                              "user_agent": "Mozilla/5.0"}}
    if kind == "auth":
        return {**base, "source": "identity", "class_name": "authentication",
                "dst_host": rng.choice(_POP["servers"]), "outcome": "success",
                "untrusted": {"auth_user": person["id"]}}
    if kind == "file":
        return {**base, "source": "endpoint", "class_name": "file_activity",
                "outcome": "opened",
                "untrusted": {"filename": rng.choice(BENIGN_FILES)}}
    if kind == "proc":
        return {**base, "source": "endpoint", "class_name": "process_activity",
                "process": rng.choice(BENIGN_PROCS), "parent_process": "explorer.exe",
                "outcome": "started",
                "untrusted": {"cmdline": rng.choice(BENIGN_PROCS)}}
    return {**base, "source": "network", "class_name": "network_activity",
            "dst_host": rng.choice(_POP["servers"]), "outcome": "established"}


def _uncommon(rng: random.Random, person: dict, base: dict) -> dict:
    """Unusual, and innocent. A working day has plenty of both.

    Each of these will trip at least one oddity in the anomaly baseline, and
    none of them is an attack. That is the point — the model reviewing these
    should mostly return nothing, and a run where it flags all of them is a
    run that tells us the approach does not work.
    """
    what = rng.choices(
        ["rare_proc", "it_script", "failed_auth", "peer_share",
         "new_saas", "external", "removable"],
        weights=[26, 14, 18, 12, 14, 10, 6], k=1)[0]

    if what == "rare_proc":                    # somebody installed something
        return {**base, "source": "endpoint", "class_name": "process_activity",
                "process": rng.choice(RARE_PROCS),
                "parent_process": rng.choice(["explorer.exe", "chrome.exe"]),
                "outcome": "started",
                "untrusted": {"cmdline": rng.choice(RARE_PROCS)}}

    if what == "it_script":                    # IT does this all day
        if not person["is_admin"]:
            return {**base, "source": "endpoint",
                    "class_name": "process_activity",
                    "process": rng.choice(RARE_PROCS),
                    "parent_process": rng.choice(RARE_PARENTS),
                    "outcome": "started",
                    "untrusted": {"cmdline": "install --silent"}}
        return {**base, "source": "endpoint", "class_name": "process_activity",
                "process": rng.choice(IT_PROCS), "parent_process": "cmd.exe",
                "outcome": "started",
                "untrusted": {"cmdline": "Get-Service | Where-Object Status"}}

    if what == "failed_auth":                  # a mistyped password
        return {**base, "source": "identity", "class_name": "authentication",
                "dst_host": rng.choice(_POP["servers"]), "outcome": "failure",
                "untrusted": {"auth_user": person["id"]}}

    if what == "peer_share":                   # borrowing a colleague's machine
        # The same colleague every time, not a different one each occurrence.
        #
        # This matters more than it looks. Random pairing gives every user an
        # occasional edge to an arbitrary machine, which turns the estate
        # into a small-world graph where everything is two hops from
        # everything — and then correlation merges an ordinary working day
        # into one enormous incident. People borrow the desk next to them.
        return {**base, "source": "identity", "class_name": "authentication",
                "dst_host": person["buddy_host"], "outcome": "success",
                "untrusted": {"auth_user": person["id"]}}

    if what == "new_saas":
        d = rng.choice(NEW_SAAS)
        return {**base, "source": "network", "class_name": "network_activity",
                "domain": d, "outcome": "resolved",
                "untrusted": {"dns_query": d, "user_agent": "Mozilla/5.0"}}

    if what == "external":
        return {**base, "source": "network", "class_name": "network_activity",
                "dst_ip": _rare_ip(rng), "dst_host": "",
                "outcome": "established",
                "untrusted": {"user_agent": "Mozilla/5.0"}}

    return {**base, "source": "endpoint", "class_name": "file_activity",
            "outcome": "copied",
            "untrusted": {"filename": f"E:\\{rng.choice(BENIGN_FILES)}"}}


def population() -> dict:
    return _POP
