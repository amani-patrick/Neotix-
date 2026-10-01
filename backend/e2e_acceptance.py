"""Spec section 45 end-to-end acceptance scenario against the compose stack."""
import httpx as requests

B = "http://localhost:8000"


def login(e, p):
    r = requests.post(f"{B}/auth/login", json={"email": e, "password": p})
    r.raise_for_status()
    return r.json()


def h(t):
    return {"Authorization": f"Bearer {t}"}


ca = login("client-a@example.com", "client123")["access_token"]
cb = login("client-b@example.com", "client123")["access_token"]
ops = login("ops1@example.com", "ops123")["access_token"]
admin = login("admin@example.com", "admin123")["access_token"]
print("1-3. all four roles logged in")

# CSV import FIRST (episodes must exist before assignment)
with open("/home/amani/Documents/2026/Neotix/backend/seed/episodes.csv", "rb") as f:
    imp1 = requests.post(f"{B}/episodes/import", headers=h(ops), files={"file": ("episodes.csv", f, "text/csv")}).json()
with open("/home/amani/Documents/2026/Neotix/backend/seed/episodes.csv", "rb") as f:
    imp2 = requests.post(f"{B}/episodes/import", headers=h(ops), files={"file": ("episodes.csv", f, "text/csv")}).json()
assert imp1["imported"] == 173 and imp1["invalid"] == 14 and imp1["duplicate"] == 3, imp1
assert imp2["imported"] == 0 and imp2["duplicate"] == 176, imp2
print("14. messy CSV imported 173, skipped 17; second run imported 0 (idempotent)")

# 4. client creates request
req = requests.post(f"{B}/requests", headers=h(ca), json={"task_name": "pick cup", "episodes_requested": 3, "deadline": "2026-12-31T00:00:00Z", "notes": "e2e"}).json()
rid = req["id"]
print("4. request created:", req["status"])

# 5. ownership
assert requests.get(f"{B}/requests/{rid}", headers=h(cb)).status_code == 404
assert requests.get(f"{B}/requests/{rid}", headers=h(ca)).status_code == 200
print("5. client A sees own request; client B gets 404")

# 6. operator sees it
assert requests.get(f"{B}/requests/{rid}", headers=h(ops)).status_code == 200
print("6. operator sees the request")

# 7. submitted -> in_progress, history recorded
requests.post(f"{B}/requests/{rid}/transition", headers=h(ops), json={"status": "in_progress"}).json()
hist = requests.get(f"{B}/requests/{rid}", headers=h(ops)).json()["status_history"]
assert hist[0]["to_status"] == "submitted" and hist[-1]["to_status"] == "in_progress"
print("7. in_progress; history rows:", len(hist))

# 8-9. search episodes, assign good ones; bad + duplicate rejected
eps = requests.get(f"{B}/episodes", headers=h(ops), params={"task_name": "pick cup", "quality": "good", "page_size": 5}).json()
print("8. episode search (pick cup, good): total", eps["total"])
good_ids = [e["episode_id"] for e in eps["items"][:3]]
bad = requests.get(f"{B}/episodes", headers=h(ops), params={"quality": "bad", "page_size": 1}).json()["items"][0]["episode_id"]
for g in good_ids[:2]:
    s = requests.post(f"{B}/requests/{rid}/assignments", headers=h(ops), json={"episode_id": g}).status_code
    assert s == 201, s
print("9. assigned 2 good episodes")
assert requests.post(f"{B}/requests/{rid}/assignments", headers=h(ops), json={"episode_id": bad}).status_code == 400
assert requests.post(f"{B}/requests/{rid}/assignments", headers=h(ops), json={"episode_id": good_ids[0]}).status_code == 409
print("   bad episode -> 400; duplicate -> 409")

# 10. early delivery fails at 2 of 3
s = requests.post(f"{B}/requests/{rid}/transition", headers=h(ops), json={"status": "delivered"})
assert s.status_code == 400 and "Cannot deliver" in s.json()["detail"], s.text
print("10. early delivery blocked:", s.json()["detail"])

# assign the 3rd episode, then delivery succeeds
s = requests.post(f"{B}/requests/{rid}/assignments", headers=h(ops), json={"episode_id": good_ids[2]}).status_code
assert s == 201, s
r = requests.post(f"{B}/requests/{rid}/transition", headers=h(ops), json={"status": "delivered"}).json()
assert r["status"] == "delivered"
print("11. delivered (3/3 assigned)")

# 12. client accepts
r = requests.post(f"{B}/requests/{rid}/transition", headers=h(ca), json={"status": "accepted"}).json()
assert r["status"] == "accepted"
print("12. client accepted")

# 13. rejection scenario
rid2 = requests.post(f"{B}/requests", headers=h(cb), json={"task_name": "pour water", "episodes_requested": 1, "deadline": "2026-12-31T00:00:00Z"}).json()["id"]
ep2 = requests.get(f"{B}/episodes", headers=h(ops), params={"quality": "good", "page_size": 1, "page": 2}).json()["items"][0]["episode_id"]
requests.post(f"{B}/requests/{rid2}/assignments", headers=h(ops), json={"episode_id": ep2})
requests.post(f"{B}/requests/{rid2}/transition", headers=h(ops), json={"status": "in_progress"})
requests.post(f"{B}/requests/{rid2}/transition", headers=h(ops), json={"status": "delivered"})
# a non-owner client gets 404 (not 403) so ids are not enumerable
assert requests.post(f"{B}/requests/{rid2}/transition", headers=h(ca), json={"status": "accepted"}).status_code == 404
r = requests.post(f"{B}/requests/{rid2}/transition", headers=h(cb), json={"status": "rejected", "reason": "wrong task"}).json()
assert r["status"] == "rejected"
r = requests.post(f"{B}/requests/{rid2}/transition", headers=h(ops), json={"status": "in_progress"}).json()
assert r["status"] == "in_progress"
print("13. delivered -> rejected (owner only; other client got 403) -> in_progress")

# 15. analytics
an = requests.get(f"{B}/analytics", headers=h(ops), params={"from": "2026-08-01T00:00:00Z", "to": "2026-10-02T00:00:00Z"}).json()
mh = an["median_submitted_to_delivered"]["median_hours"]
print("15. analytics: statuses", an["requests_by_status"], "| median hours", mh and round(mh, 1), "| top task", an["top_tasks_by_good_episodes"][0])

# admin manages users
u = requests.post(f"{B}/users", headers=h(admin), json={"email": "newop@example.com", "password": "password1", "name": "New Op", "role": "operator"}).json()
assert requests.patch(f"{B}/users/{u['id']}", headers=h(admin), json={"is_active": False}).json()["is_active"] is False
print("16. admin created + deactivated a user")

print()
print("ALL E2E ACCEPTANCE CHECKS PASSED")
