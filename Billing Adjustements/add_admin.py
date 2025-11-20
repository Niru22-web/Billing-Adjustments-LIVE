from app import app, db, User

with app.app_context():
    # Change password as you like. Plaintext used for now.
    if not User.query.filter_by(username="admin").first():
        u = User(username="admin", password="admin123", role="admin", center="ALL")
        db.session.add(u)
        db.session.commit()
        print("Admin user created (admin/admin123).")
    else:
        print("Admin user already exists.")
