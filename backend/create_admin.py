from db import init_db, create_user
from werkzeug.security import generate_password_hash
import sqlite3
from db import DB_PATH

init_db()
# Try to create; if exists, update password to 'admin'
ok = create_user("admin", "admin", role="admin")
if not ok:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("UPDATE users SET password_hash = ? WHERE username = ?", (generate_password_hash("admin"), "admin"))
    conn.commit()
    conn.close()
    ok = True
print("Created/updated admin:", ok)
