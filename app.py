
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import sqlite3
from pathlib import Path
from datetime import date
from urllib.parse import urlparse, parse_qs

DB_FILE = Path(__file__).with_name("expense_tracker.db")


def connect_db():
    connection = sqlite3.connect(DB_FILE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_db():
    with connect_db() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount > 0),
                category TEXT NOT NULL,
                date TEXT NOT NULL,
                FOREIGN KEY(profile_id)
                    REFERENCES profiles(id)
                    ON DELETE CASCADE
            )
        """)


class ExpenseTracker(BaseHTTPRequestHandler):

    def send_json(self, status, data):
        body = json.dumps(
            data, ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, DELETE, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, DELETE, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.end_headers()

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))

        if length <= 0 or length > 10000:
            raise ValueError("Invalid request size")

        raw_data = self.rfile.read(length).decode("utf-8")
        data = json.loads(raw_data)

        if not isinstance(data, dict):
            raise ValueError("JSON object required")

        return data

    def get_profile_id(self, query):
        values = query.get("profile_id", [])

        if not values:
            return None

        try:
            profile_id = int(values[0])
            return profile_id if profile_id > 0 else None
        except (ValueError, TypeError):
            return None

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)

        try:
            with connect_db() as connection:

                if route == "/":
                    self.send_json(200, {
                        "message": "Personal Expense Tracker API is running",
                        "routes": [
                            "GET /profiles",
                            "POST /profiles",
                            "GET /expenses?profile_id=1",
                            "POST /expenses",
                            "DELETE /expenses/1?profile_id=1"
                        ]
                    })
                    return

                if route == "/profiles":
                    profiles = connection.execute("""
                        SELECT id, name, created_at
                        FROM profiles
                        ORDER BY id DESC
                    """).fetchall()

                    self.send_json(200, [
                        dict(profile) for profile in profiles
                    ])
                    return

                if route == "/expenses":
                    profile_id = self.get_profile_id(query)

                    if profile_id is None:
                        self.send_json(400, {
                            "error": "A valid profile_id is required"
                        })
                        return

                    profile = connection.execute(
                        "SELECT id FROM profiles WHERE id = ?",
                        (profile_id,)
                    ).fetchone()

                    if profile is None:
                        self.send_json(404, {
                            "error": "Profile not found"
                        })
                        return

                    expenses = connection.execute("""
                        SELECT id, profile_id, name, amount,
                               category, date
                        FROM expenses
                        WHERE profile_id = ?
                        ORDER BY date DESC, id DESC
                    """, (profile_id,)).fetchall()

                    self.send_json(200, [
                        dict(expense) for expense in expenses
                    ])
                    return

                self.send_json(404, {
                    "error": "Route not found"
                })

        except sqlite3.Error:
            self.send_json(500, {
                "error": "Database operation failed"
            })

    def do_POST(self):
        parsed = urlparse(self.path)
        route = parsed.path

        try:
            data = self.read_json()
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {
                "error": "Invalid request data"
            })
            return

        try:
            with connect_db() as connection:

                if route == "/profiles":
                    name = data.get("name")

                    if not isinstance(name, str) or not name.strip():
                        self.send_json(400, {
                            "error": "Profile name is required"
                        })
                        return

                    name = name.strip()

                    if len(name) > 60:
                        self.send_json(400, {
                            "error": "Name must be 60 characters or fewer"
                        })
                        return

                    existing = connection.execute("""
                        SELECT id, name
                        FROM profiles
                        WHERE name = ?
                    """, (name,)).fetchone()

                    if existing:
                        self.send_json(200, {
                            "message": "Profile already exists",
                            "profile": dict(existing)
                        })
                        return

                    cursor = connection.execute("""
                        INSERT INTO profiles (name)
                        VALUES (?)
                    """, (name,))

                    profile = connection.execute("""
                        SELECT id, name, created_at
                        FROM profiles
                        WHERE id = ?
                    """, (cursor.lastrowid,)).fetchone()

                    self.send_json(201, {
                        "message": "Profile created successfully",
                        "profile": dict(profile)
                    })
                    return

                if route == "/expenses":
                    profile_id = data.get("profile_id")
                    name = data.get("name")
                    amount = data.get("amount")
                    category = data.get("category")
                    expense_date = data.get("date")

                    if (
                        isinstance(profile_id, bool)
                        or not isinstance(profile_id, int)
                        or profile_id <= 0
                    ):
                        self.send_json(400, {
                            "error": "A valid profile_id is required"
                        })
                        return

                    if (
                        not isinstance(name, str)
                        or not name.strip()
                        or len(name.strip()) > 100
                    ):
                        self.send_json(400, {
                            "error": "Expense name is required (max 100 characters)"
                        })
                        return

                    if (
                        isinstance(amount, bool)
                        or not isinstance(amount, (int, float))
                        or amount <= 0
                    ):
                        self.send_json(400, {
                            "error": "Amount must be greater than zero"
                        })
                        return

                    if amount > 1000000000000:
                        self.send_json(400, {
                            "error": "Amount is too large"
                        })
                        return

                    if (
                        not isinstance(category, str)
                        or not category.strip()
                        or len(category.strip()) > 60
                    ):
                        self.send_json(400, {
                            "error": "Category is required (max 60 characters)"
                        })
                        return

                    try:
                        parsed_date = date.fromisoformat(expense_date)
                        if parsed_date.isoformat() != expense_date:
                            raise ValueError
                    except (ValueError, TypeError):
                        self.send_json(400, {
                            "error": "A valid date in YYYY-MM-DD format is required"
                        })
                        return

                    profile = connection.execute(
                        "SELECT id FROM profiles WHERE id = ?",
                        (profile_id,)
                    ).fetchone()

                    if profile is None:
                        self.send_json(404, {
                            "error": "Profile not found"
                        })
                        return

                    cursor = connection.execute("""
                        INSERT INTO expenses (
                            profile_id, name, amount, category, date
                        )
                        VALUES (?, ?, ?, ?, ?)
                    """, (
                        profile_id,
                        name.strip(),
                        amount,
                        category.strip(),
                        expense_date
                    ))

                    expense = connection.execute("""
                        SELECT id, profile_id, name, amount,
                               category, date
                        FROM expenses
                        WHERE id = ?
                    """, (cursor.lastrowid,)).fetchone()

                    self.send_json(201, {
                        "message": "Expense added successfully",
                        "expense": dict(expense)
                    })
                    return

                self.send_json(404, {
                    "error": "Route not found"
                })

        except sqlite3.IntegrityError:
            self.send_json(400, {
                "error": "Invalid profile or database data"
            })
        except sqlite3.Error:
            self.send_json(500, {
                "error": "Could not save data"
            })

    def do_DELETE(self):
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)

        if not route.startswith("/expenses/"):
            self.send_json(404, {
                "error": "Route not found"
            })
            return

        try:
            expense_id = int(route.rsplit("/", 1)[1])

            if expense_id <= 0:
                raise ValueError

        except ValueError:
            self.send_json(400, {
                "error": "Invalid expense ID"
            })
            return

        profile_id = self.get_profile_id(query)

        if profile_id is None:
            self.send_json(400, {
                "error": "A valid profile_id is required"
            })
            return

        try:
            with connect_db() as connection:
                cursor = connection.execute("""
                    DELETE FROM expenses
                    WHERE id = ? AND profile_id = ?
                """, (expense_id, profile_id))

                if cursor.rowcount == 0:
                    self.send_json(404, {
                        "error": "Expense not found in this profile"
                    })
                    return

                self.send_json(200, {
                    "message": "Expense deleted successfully"
                })

        except sqlite3.Error:
            self.send_json(500, {
                "error": "Could not delete expense"
            })

    def log_message(self, format, *args):
        print(
            f"[{self.log_date_time_string()}] "
            f"{format % args}"
        )


if __name__ == "__main__":
    initialize_db()

    server = HTTPServer(
        ("127.0.0.1", 8000),
        ExpenseTracker
    )

    print("Personal Expense Tracker backend is running")
    print("API: http://127.0.0.1:8000")
    print("Database:", DB_FILE)
    print("Press Ctrl+C to stop the server")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
    finally:
        server.server_close()
