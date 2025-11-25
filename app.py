# app.py — PostgreSQL-backed (JOIN Enrollment -> Adjustment) — updated
from flask import (
    Flask, render_template, request, redirect, url_for, session,
    send_from_directory, send_file, jsonify, abort
)
from datetime import datetime, date, time
import os, io, uuid, json
import pandas as pd
from sqlalchemy.exc import IntegrityError
from flask_sqlalchemy import SQLAlchemy

# ---------- Config ----------
app = Flask(__name__, static_folder="Static", template_folder="templates")
app.secret_key = os.environ.get("FLASK_SECRET", "supersecretkey")

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL",
    "postgresql://asa_data_entry_user:zWCMwxhDbIEP174n6StgP0cqsQWAfUYD@dpg-d4en8cfgi27c73cq26v0-a.oregon-postgres.render.com/asa_data_entry"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_pre_ping": True,     # auto-reconnect before each use
    "pool_recycle": 300,       # reconnect every 5 minutes
}


db = SQLAlchemy(app)

# ---------- Column names (front-end expects these) ----------
ENROLL_COLUMNS = [
    "Centre", "Family", "Child's Name", "Child Status", "Family Status", "Billing Cycle"
]

ADJUST_COLUMNS = [
    "ID", "Centre", "Date Updated", "Family", "Child's Name", "Adjustment Amount",
    "Note/Description", "Pulling Category", "Pulling Instructions",
    "Start Date", "End Date", "Adjustment is Recurring?", "Approval",
    "Child Status", "Family Status", "Billing Cycle"
]

# ---------- Models ----------
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), default="user")
    center = db.Column(db.String(100), default="")

class Enrollment(db.Model):
    __tablename__ = "enrollment"

    id = db.Column(db.Integer, primary_key=True)
    Centre = db.Column(db.String(200))
    Family = db.Column(db.String(200))
    ChildName = db.Column(db.String(200))
    ChildStatus = db.Column(db.String(200))
    FamilyStatus = db.Column(db.String(200))
    BillingCycle = db.Column(db.String(200))

    adjustments = db.relationship(
        "Adjustment",
        backref="enrollment",
        lazy=True
    )


class Adjustment(db.Model):
    __tablename__ = "adjustments"

    # id as string (UUID)
    id = db.Column(db.String(36), primary_key=True)

    enrollment_id = db.Column(
        db.Integer,
        db.ForeignKey("enrollment.id"),
        nullable=True
    )

    DateUpdated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # SQL column names matching CSV/front-end keys where needed
    Centre = db.Column("Centre", db.String(200))
    Family = db.Column("Family", db.String(200))
    Childs_Name = db.Column("Child's Name", db.String(200))

    AdjustmentAmount = db.Column("Adjustment Amount", db.Float)
    NoteDescription = db.Column("Note/Description", db.Text)

    PullingCategory = db.Column("Pulling Category", db.String(100))
    PullingInstructions = db.Column("Pulling Instructions", db.Text)

    StartDate = db.Column("Start Date", db.Date)
    EndDate = db.Column("End Date", db.Date)

    AdjustmentRecurring = db.Column("Adjustment is Recurring?", db.String(20))
    Approval = db.Column("Approval", db.String(50))

    ChildStatus = db.Column("Child Status", db.String(100))
    FamilyStatus = db.Column("Family Status", db.String(100))
    BillingCycle = db.Column("Billing Cycle", db.String(100))

# ---------- Utilities ----------
USER_FILE = "data/users.json"
ENROLL_FILE = "data/ChildEnrollment.csv"
ADJUST_FILE = "data/Adjustments.csv"

def ensure_data_dir():
    os.makedirs("data", exist_ok=True)

def load_users():
    ensure_data_dir()
    if os.path.exists(USER_FILE):
        with open(USER_FILE, "r") as f:
            return json.load(f)
    return []

def save_users(users):
    ensure_data_dir()
    with open(USER_FILE, "w") as f:
        json.dump(users, f, indent=2)

def parse_date_safe(s):
    if not s:
        return None
    if isinstance(s, date) and not isinstance(s, datetime):
        return s
    if isinstance(s, datetime):
        return s.date()
    try:
        # accept ISO date or datetime
        if "T" in str(s):
            return datetime.fromisoformat(str(s)).date()
        return datetime.fromisoformat(str(s)).date()
    except Exception:
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(str(s), fmt).date()
            except Exception:
                continue
    return None

def ensure_datetime_from_date_or_dt(v):
    """Input can be date or datetime or None. Return datetime or None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        # convert date to datetime at midnight
        return datetime.combine(v, time.min)
    try:
        return datetime.fromisoformat(str(v))
    except Exception:
        return None

def date_to_iso(d):
    return d.isoformat() if isinstance(d, (date, datetime)) else (str(d) if d else "")

def today_iso():
    return datetime.now().strftime("%Y-%m-%d")

def current_user():
    return (
        session.get("user"),
        (session.get("role") or "user").strip().lower(),
        session.get("center", "")
    )

def require_login():
    return "user" in session

# ---------- DB -> DataFrame loader (JOIN enrollment -> adjustment) ----------
def load_adjustments_df():
    rows = Adjustment.query.all()
    data = []
    for r in rows:
        # DateUpdated may be datetime; safe formatting
        du = r.DateUpdated
        if isinstance(du, datetime):
            du_str = du.strftime("%Y-%m-%d")
        elif isinstance(du, date):
            du_str = du.isoformat()
        else:
            du_str = ""

        data.append({
            "ID": r.id,
            "Centre": r.Centre or "",
            "Family": r.Family or "",
            "Child's Name": r.Childs_Name or "",
            "Adjustment Amount": r.AdjustmentAmount if r.AdjustmentAmount is not None else "",
            "Note/Description": r.NoteDescription or "",
            "Pulling Category": r.PullingCategory or "",
            "Pulling Instructions": r.PullingInstructions or "",
            "Start Date": (r.StartDate.isoformat() if isinstance(r.StartDate, (date, datetime)) else (str(r.StartDate) if r.StartDate else "")),
            "End Date": (r.EndDate.isoformat() if isinstance(r.EndDate, (date, datetime)) else (str(r.EndDate) if r.EndDate else "")),
            "Adjustment is Recurring?": r.AdjustmentRecurring or "",
            "Approval": r.Approval or "",
            "Child Status": r.ChildStatus or "",
            "Family Status": r.FamilyStatus or "",
            "Billing Cycle": r.BillingCycle or "",
            "Date Updated": du_str
        })
    # Ensure DataFrame always has the expected columns
    df = pd.DataFrame(data)
    for col in ADJUST_COLUMNS:
        if col not in df.columns:
            df[col] = ""
    # Keep columns order stable
    df = df[ADJUST_COLUMNS]
    return df

# ---------- CSV import (optional) ----------
def import_csv_to_db_if_empty():
    """
    If DB tables are empty and CSV files exist, import them.
    For adjustments CSV we will:
      - ensure Enrollment rows exist for (Centre, ChildName)
      - create Adjustment rows pointing to the enrollment.id
    """
    # Enroll import
    if Enrollment.query.count() == 0 and os.path.exists(ENROLL_FILE):
        try:
            df_en = pd.read_csv(ENROLL_FILE).fillna("").astype(str)
            for _, r in df_en.iterrows():
                centre = str(r.get("Centre","")).strip()
                child = str(r.get("Child's Name","")).strip()
                if not centre and not child:
                    continue
                enrol = Enrollment(
                    Centre=centre,
                    Family=str(r.get("Family","")).strip(),
                    ChildName=child,
                    ChildStatus=str(r.get("Child Status","")).strip(),
                    FamilyStatus=str(r.get("Family Status","")).strip(),
                    BillingCycle=str(r.get("Billing Cycle","")).strip()
                )
                db.session.add(enrol)
            db.session.commit()
            print("Imported enrollment CSV into DB.")
        except Exception as e:
            db.session.rollback()
            print("Enrollment import failed:", e)

    # Adjust import: create enrollment if needed, set enrollment_id
    if Adjustment.query.count() == 0 and os.path.exists(ADJUST_FILE):
        try:
            df = pd.read_csv(ADJUST_FILE).fillna("").astype(str)
            for _, r in df.iterrows():
                # gather enrollment key
                centre = str(r.get("Centre","")).strip()
                child = str(r.get("Child's Name","")).strip()

                # ensure or find enrollment
                enrol = None
                if centre and child:
                    enrol = Enrollment.query.filter_by(Centre=centre, ChildName=child).first()
                    if not enrol:
                        enrol = Enrollment(
                            Centre=centre,
                            Family=str(r.get("Family","")).strip(),
                            ChildName=child,
                            ChildStatus=str(r.get("Child Status","")).strip(),
                            FamilyStatus=str(r.get("Family Status","")).strip(),
                            BillingCycle=str(r.get("Billing Cycle","")).strip()
                        )
                        db.session.add(enrol)
                        db.session.flush()  # get id without commit

                idv = str(r.get("ID") or "").strip() or str(uuid.uuid4())
                start = parse_date_safe(r.get("Start Date",""))
                end = parse_date_safe(r.get("End Date",""))
                date_updated_raw = r.get("Date Updated","")
                date_updated_date = parse_date_safe(date_updated_raw) or datetime.utcnow().date()
                # convert to datetime
                date_updated = ensure_datetime_from_date_or_dt(date_updated_date)
                try:
                    amt = float(str(r.get("Adjustment Amount","")).replace("$","").strip()) if str(r.get("Adjustment Amount","")).strip() else 0.0
                except:
                    amt = 0.0

                adj = Adjustment(
                    id=idv,
                    enrollment_id=enrol.id if enrol else None,
                    DateUpdated=date_updated,
                    StartDate=start,
                    EndDate=end,
                    AdjustmentAmount=amt,
                    NoteDescription=str(r.get("Note/Description","")).strip(),
                    PullingCategory=str(r.get("Pulling Category","")).strip(),
                    PullingInstructions=str(r.get("Pulling Instructions","")).strip(),
                    AdjustmentRecurring=str(r.get("Adjustment is Recurring?","")).strip(),
                    Approval=str(r.get("Approval","")).strip(),
                    ChildStatus=str(r.get("Child Status","")).strip(),
                    FamilyStatus=str(r.get("Family Status","")).strip(),
                    BillingCycle=str(r.get("Billing Cycle","")).strip(),
                    Centre=str(r.get("Centre","")).strip(),
                    Family=str(r.get("Family","")).strip(),
                    Childs_Name=str(r.get("Child's Name","")).strip()
                )
                db.session.add(adj)
            db.session.commit()
            print("Imported adjustments CSV into DB.")
        except Exception as e:
            db.session.rollback()
            print("Adjustments import failed:", e)

# ---------- Autofill helpers ----------
def build_details_map():
    rows = Enrollment.query.all()
    m = {}
    for r in rows:
        key = f"{(r.Centre or '').strip().lower()}|||{(r.ChildName or '').strip().lower()}"
        m[key] = {
            "Child Status": r.ChildStatus or "",
            "Family Status": r.FamilyStatus or "",
            "Billing Cycle": r.BillingCycle or ""
        }
    return m

def fill_auto_fields(payload):
    centre = payload.get("Centre","").strip().lower()
    child = payload.get("Child's Name","").strip().lower()
    key = f"{centre}|||{child}"
    details = build_details_map().get(key, {"Child Status": "", "Family Status": "", "Billing Cycle": ""})
    payload.update(details)
    return payload

# ---------- Routes: Auth ----------
@app.route("/")
def index():
    return render_template("index.html", current_year=datetime.now().year)

@app.route("/login", methods=["GET", "POST"])
def login():
    # If already logged in
    if session.get("user"):
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = (request.form.get("password") or "").strip()

        if not username or not password:
            return render_template("login.html", error="Please enter both username and password")

        try:
            # Query PostgreSQL via SQLAlchemy model
            user = User.query.filter(User.username == username).first()

            if not user:
                return render_template("login.html", error="Invalid username or password")

            # Password check (plain text)
            if user.password != password:
                return render_template("login.html", error="Invalid username or password")

            # Save session
            session["user"] = user.username
            session["role"] = (user.role or "user").strip().lower()
            session["center"] = user.center or ""

            return redirect(url_for("dashboard"))

        except Exception as e:
            print("LOGIN ERROR:", e)
            return render_template("login.html", error="Login failed. Try again later.")

    return render_template("login.html")

@app.route("/forgot", methods=["GET","POST"])
def forgot():
    users = load_users()
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        newpw = request.form.get("new_password") or ""
        for u in users:
            if u.get("username") == username:
                u["password"] = newpw
                save_users(users)
                return "<h3>Password updated. <a href='/login'>Login</a></h3>"
        return "<h3>Username not found.</h3>"
    return render_template("forgot.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

# ---------- API ----------
@app.route("/api/children")
def api_children():
    if not require_login():
        return abort(401)
    _, role, user_center = current_user()
    q_center = (request.args.get("center") or request.args.get("centre") or "").strip()
    query = Enrollment.query
    if role == "admin":
        if q_center:
            query = query.filter_by(Centre=q_center)
    else:
        query = query.filter_by(Centre=user_center)
    rows = query.all()
    children = sorted({(r.ChildName or "").strip() for r in rows if r.ChildName})
    families = sorted({(r.Family or "").strip() for r in rows if r.Family})
    centers = sorted({(r.Centre or "").strip() for r in Enrollment.query.distinct(Enrollment.Centre)})
    return jsonify({"children": children, "families": families, "centers": centers})

@app.route("/api/child_details")
def api_child_details():
    if not require_login():
        return abort(401)

    centre = (request.args.get("centre") or "").strip()
    child  = (request.args.get("child") or "").strip()

    # 🔥 FIX: Normalize input (Child's Name → ChildName)
    # remove apostrophes/spaces to match DB values safely
    child_clean = child.replace("'", "").replace(" ", "").lower()

    row = Enrollment.query.filter(
        db.func.lower(Enrollment.Centre) == centre.lower(),
        db.func.lower(Enrollment.ChildName) == child_clean
    ).first()

    if not row:
        return jsonify({"Child Status": "", "Family Status": "", "Billing Cycle": ""})

    return jsonify({
        "Child Status": row.ChildStatus or "",
        "Family Status": row.FamilyStatus or "",
        "Billing Cycle": row.BillingCycle or ""
    })

# ---------- Dashboard ----------
@app.route("/dashboard")
def dashboard():
    if not require_login():
        return redirect(url_for("login"))

    user, role, center = current_user()

    df = load_adjustments_df()

    if "Centre" not in df.columns:
        df["Centre"] = ""

    df["Centre"] = df["Centre"].astype(str).str.strip()
    selected_center = (request.args.get("center") or "").strip()
    all_centers = sorted(df["Centre"].dropna().unique().tolist())

    if role == "admin":
        if selected_center:
            df = df[df["Centre"].str.lower() == selected_center.lower()]
    else:
        df = df[df["Centre"].str.lower() == str(center).strip().lower()]
        selected_center = center

    records = df.fillna("").to_dict("records")

    total = len(records)
    approved_count = df[df["Approval"].astype(str).str.lower() == "approved"].shape[0]
    pending_count = df[df["Approval"].astype(str).str.lower() == "pending"].shape[0]
    not_approved_count = df[
        (df["Approval"].astype(str).str.strip() == "") |
        (df["Approval"].astype(str).str.lower().isin(["not approved", "rejected", "no"]))
    ].shape[0]

    try:
        total_adjustment_amount = df["Adjustment Amount"].astype(str).replace("", "0").astype(float).sum()
    except Exception:
        total_adjustment_amount = 0.0

    return render_template(
        "dashboard.html",
        data=records,
        total=total,
        role=role,
        user_center=center,
        username=user,
        centers=all_centers,
        selected_center=selected_center,
        approved_count=approved_count,
        pending_count=pending_count,
        not_approved_count=not_approved_count,
        total_adjustment_amount=f"${total_adjustment_amount:,.2f}"
    )

# ---------- Validation ----------
MANDATORY_FIELDS = [
    "Centre","Family","Child's Name","Adjustment Amount","Note/Description",
    "Pulling Category","Start Date","End Date","Adjustment is Recurring?","Approval"
]

def validate_payload(payload, role):
    missing = [k for k in MANDATORY_FIELDS if not str(payload.get(k,"")).strip()]
    try:
        float(str(payload.get("Adjustment Amount","")).strip())
    except:
        missing.append("Adjustment Amount (must be number)")
    for f in ["Start Date","End Date"]:
        try:
            _ = datetime.fromisoformat(str(payload.get(f,"")).strip())
        except:
            missing.append(f + " (invalid date, use YYYY-MM-DD)")
    try:
        s = datetime.fromisoformat(payload.get("Start Date",""))
        e = datetime.fromisoformat(payload.get("End Date",""))
        if e < s:
            missing.append("End Date must be on or after Start Date")
    except:
        pass
    if role != "admin":
        payload["Approval"] = "Pending"
    return missing, payload

# ---------- CRUD ----------
@app.route("/records/add", methods=["POST"])
def add_record():
    if not require_login():
        return abort(401)
    user, role, center = current_user()
    keys = [
        "Centre","Family","Child's Name","Adjustment Amount","Note/Description",
        "Pulling Category","Pulling Instructions","Start Date","End Date",
        "Adjustment is Recurring?","Approval","Child Status","Family Status","Billing Cycle"
    ]
    payload = {k: (request.form.get(k) or "").strip() for k in keys}
    payload["Date Updated"] = today_iso()
    if role != "admin":
        payload["Centre"] = center
        payload["Approval"] = "Pending"
    if payload.get("Pulling Category","") == "Pull":
        payload["Pulling Instructions"] = ""

    payload = fill_auto_fields(payload)
    missing, payload = validate_payload(payload, role)
    if missing:
        return jsonify({"ok": False, "error": "Missing/invalid: " + ", ".join(missing)}), 400

    try:
        amt = float(payload.get("Adjustment Amount") or 0.0)
    except:
        amt = 0.0

    new_id = str(uuid.uuid4())

    # ensure or create enrollment
    enrol = None
    if payload.get("Centre","") and payload.get("Child's Name",""):
        enrol = Enrollment.query.filter_by(Centre=payload["Centre"], ChildName=payload["Child's Name"]).first()
        if not enrol:
            enrol = Enrollment(
                Centre=payload["Centre"],
                Family=payload.get("Family",""),
                ChildName=payload["Child's Name"],
                ChildStatus=payload.get("Child Status",""),
                FamilyStatus=payload.get("Family Status",""),
                BillingCycle=payload.get("Billing Cycle","")
            )
            db.session.add(enrol)
            db.session.flush()  # ensure enrol.id available

    # convert Date Updated to datetime
    du_date = parse_date_safe(payload.get("Date Updated",""))
    du_dt = ensure_datetime_from_date_or_dt(du_date) or datetime.utcnow()

    adj = Adjustment(
        id=new_id,
        enrollment_id=enrol.id if enrol else None,
        Centre=payload.get("Centre", ""),
        Family=payload.get("Family", ""),
        Childs_Name=payload.get("Child's Name", ""),
        DateUpdated=du_dt,
        StartDate=parse_date_safe(payload.get("Start Date","")),
        EndDate=parse_date_safe(payload.get("End Date","")),
        AdjustmentAmount=amt,
        NoteDescription=payload.get("Note/Description",""),
        PullingCategory=payload.get("Pulling Category",""),
        PullingInstructions=payload.get("Pulling Instructions",""),
        AdjustmentRecurring=payload.get("Adjustment is Recurring?",""),
        Approval=payload.get("Approval",""),
        ChildStatus=payload.get("Child Status",""),
        FamilyStatus=payload.get("Family Status",""),
        BillingCycle=payload.get("Billing Cycle","")
    )

    try:
        db.session.add(adj)
        db.session.commit()

        # Build a record dict to return to frontend so JS can render immediately
        record = {
            "ID": new_id,
            "id": new_id,
            "Centre": adj.Centre or "",
            "Family": adj.Family or "",
            "Child's Name": adj.Childs_Name or "",
            "Adjustment Amount": adj.AdjustmentAmount if adj.AdjustmentAmount is not None else "",
            "Note/Description": adj.NoteDescription or "",
            "Pulling Category": adj.PullingCategory or "",
            "Pulling Instructions": adj.PullingInstructions or "",
            "Start Date": (adj.StartDate.isoformat() if adj.StartDate else ""),
            "End Date": (adj.EndDate.isoformat() if adj.EndDate else ""),
            "Adjustment is Recurring?": adj.AdjustmentRecurring or "",
            "Approval": adj.Approval or "",
            "Child Status": adj.ChildStatus or "",
            "Family Status": adj.FamilyStatus or "",
            "Billing Cycle": adj.BillingCycle or "",
            "Date Updated": adj.DateUpdated.strftime("%Y-%m-%d") if adj.DateUpdated else ""
        }

        # return full record so frontend can use returned values immediately
        return jsonify({"ok": True, "record": record})

    except IntegrityError as e:
        db.session.rollback()
        return jsonify({"ok": False, "error": "Integrity error: " + str(e)}), 500
    except Exception as e:
        db.session.rollback()
        return jsonify({"ok": False, "error": "DB error: " + str(e)}), 500

@app.route("/records/edit/<id>", methods=["POST"])
def edit_record(id):
    if not require_login():
        return abort(401)
    user, role, center = current_user()
    adj = Adjustment.query.filter_by(id=str(id)).first()
    if not adj:
        return abort(404)
    if role != "admin":
        # find associated enrollment centre or block
        enr = adj.enrollment
        if not enr or (enr.Centre or "").strip().lower() != str(center).strip().lower():
            return abort(403)

    keys = [
        "Centre","Family","Child's Name","Adjustment Amount","Note/Description",
        "Pulling Category","Pulling Instructions","Start Date","End Date",
        "Adjustment is Recurring?","Approval","Child Status","Family Status","Billing Cycle"
    ]
    payload = {k: (request.form.get(k) or "").strip() for k in keys}
    payload["Date Updated"] = today_iso()
    if role != "admin":
        payload["Centre"] = center
        payload["Approval"] = adj.Approval or "Pending"
    if payload.get("Pulling Category","") == "Pull":
        payload["Pulling Instructions"] = ""

    payload = fill_auto_fields(payload)
    missing, payload = validate_payload(payload, role)
    if missing:
        return jsonify({"ok": False, "error": "Missing/invalid: " + ", ".join(missing)}), 400

    try:
        # ensure or update enrollment
        enrol = None
        if payload.get("Centre","") and payload.get("Child's Name",""):
            enrol = Enrollment.query.filter_by(Centre=payload["Centre"], ChildName=payload["Child's Name"]).first()
            if not enrol:
                enrol = Enrollment(
                    Centre=payload["Centre"],
                    Family=payload.get("Family",""),
                    ChildName=payload["Child's Name"],
                    ChildStatus=payload.get("Child Status",""),
                    FamilyStatus=payload.get("Family Status",""),
                    BillingCycle=payload.get("Billing Cycle","")
                )
                db.session.add(enrol)
                db.session.flush()

        adj.enrollment_id = enrol.id if enrol else adj.enrollment_id
        # update Centre/Family/Childs_Name on the adjustment as well
        adj.Centre = payload.get("Centre","")
        adj.Family = payload.get("Family","")
        adj.Childs_Name = payload.get("Child's Name","")

        adj.DateUpdated = ensure_datetime_from_date_or_dt(parse_date_safe(payload.get("Date Updated",""))) or datetime.utcnow()
        adj.StartDate = parse_date_safe(payload.get("Start Date",""))
        adj.EndDate = parse_date_safe(payload.get("End Date",""))
        try:
            adj.AdjustmentAmount = float(payload.get("Adjustment Amount") or 0.0)
        except:
            adj.AdjustmentAmount = 0.0
        adj.NoteDescription = payload.get("Note/Description","")
        adj.PullingCategory = payload.get("Pulling Category","")
        adj.PullingInstructions = payload.get("Pulling Instructions","")
        adj.AdjustmentRecurring = payload.get("Adjustment is Recurring?","")
        adj.Approval = payload.get("Approval","")
        adj.ChildStatus = payload.get("Child Status","")
        adj.FamilyStatus = payload.get("Family Status","")
        adj.BillingCycle = payload.get("Billing Cycle","")
        db.session.commit()

        return jsonify({"ok": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"ok": False, "error": "DB error: " + str(e)}), 500

@app.route("/records/delete/<id>", methods=["POST"])
def delete_record(id):
    if not require_login():
        return abort(401)
    user, role, center = current_user()
    adj = Adjustment.query.filter_by(id=str(id)).first()
    if not adj:
        return abort(404)
    # if non-admin, ensure user's centre matches the enrollment centre
    if role != "admin":
        enr = adj.enrollment
        if not enr or (enr.Centre or "").strip().lower() != str(center).strip().lower():
            return abort(403)
    try:
        db.session.delete(adj)
        db.session.commit()
        return jsonify({"ok": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"ok": False, "error": "DB error: " + str(e)}), 500

# ---------- Bulk approval ----------
@app.route("/records/bulk_approval", methods=["POST"])
def bulk_approval():
    if not require_login():
        return abort(401)
    user, role, center = current_user()
    if role != "admin":
        return abort(403)
    try:
        data = request.get_json(force=True) or {}
        ids = data.get("ids", [])
        status = str(data.get("status","")).strip()
    except:
        return jsonify({"ok": False, "error": "Invalid JSON payload"}), 400
    valid_status = {"Pending","Approved","Not Approved"}
    if status not in valid_status:
        return jsonify({"ok": False, "error": "Invalid status value"}), 400
    if not ids:
        return jsonify({"ok": False, "error": "No record IDs provided"}), 400
    rows = Adjustment.query.filter(Adjustment.id.in_(ids)).all()
    if not rows:
        return jsonify({"ok": False, "error": "No matching records"}), 404
    try:
        for r in rows:
            r.Approval = status
            r.DateUpdated = datetime.utcnow()
        db.session.commit()
        return jsonify({"ok": True, "updated": len(rows)})
    except Exception as e:
        db.session.rollback()
        return jsonify({"ok": False, "error": "DB error: " + str(e)}), 500

# ---------- Export ----------
@app.route("/export")
def export_excel():
    if not require_login():
        return abort(401)
    user, role, center = current_user()
    req_center = (request.args.get("center") or "").strip()
    df = load_adjustments_df()
    if "Centre" not in df.columns:
        df["Centre"] = ""
    df["Centre"] = df["Centre"].astype(str).str.strip()
    if role == "admin":
        if req_center:
            df = df[df["Centre"].str.lower() == req_center.lower()]
    else:
        df = df[df["Centre"].str.lower() == str(center).strip().lower()]
        req_center = center
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Adjustments")
    output.seek(0)
    filename = f"Adjustments_{(req_center or 'All')}_{datetime.now().strftime('%Y%m%d-%H%M%S')}.xlsx"
    return send_file(
        output,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

# ---------- Debug route ----------
@app.route("/debug_adjustments")
def debug_adjustments():
    if not require_login():
        return abort(401)
    df = load_adjustments_df()
    return df.to_html(index=False)

# ---------- Static files ----------
@app.route("/Static/<path:filename>")
def custom_static(filename):
    return send_from_directory(app.static_folder, filename)

# ---------- Startup ----------
if __name__ == "__main__":
    ensure_data_dir()
    with app.app_context():
        db.create_all()
        import_csv_to_db_if_empty()

    # Only use debug mode after DB setup
    app.run(debug=False)     # SET TO False for stability
