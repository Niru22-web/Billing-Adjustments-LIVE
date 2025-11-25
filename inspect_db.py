# inspect_db.py — run from project folder with your venv active: python inspect_db.py
from app import app, db, Adjustment, Enrollment

def main():
    with app.app_context():
        print("=== DB Info ===")
        try:
            print("Enrollment count:", Enrollment.query.count())
        except Exception as e:
            print("Enrollment query failed:", e)

        try:
            print("Adjustment count:", Adjustment.query.count())
        except Exception as e:
            print("Adjustment query failed:", e)

        print("\n--- Adjustments (show id, enrollment_id, child status, family status) ---")
        for a in Adjustment.query.limit(50).all():
            # Try to read associated enrollment safely
            enr = None
            try:
                enr = a.enrollment
            except Exception:
                pass
            print({
                "id": a.id,
                "enrollment_id": getattr(a, "enrollment_id", None),
                "enrollment_exists": bool(enr),
                "enrollment_id_from_obj": getattr(enr, "id", None) if enr else None,
                "enrol_child": getattr(enr, "ChildName", None) if enr else None,
                "AdjustmentAmount": getattr(a, "AdjustmentAmount", None),
                "Approval": getattr(a, "Approval", None)
            })

        print("\n--- Enrollments (first 20) ---")
        for e in Enrollment.query.limit(20).all():
            print({
                "id": e.id,
                "Centre": getattr(e, "Centre", None),
                "Family": getattr(e, "Family", None),
                "ChildName": getattr(e, "ChildName", None)
            })

if __name__ == "__main__":
    main()
