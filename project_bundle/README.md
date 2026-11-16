# மக்கள் புகார் செயலி — Makkal Pugar Seyali (Enterprise Mobile + Django + MySQL)

Production-ready bilingual (Tamil & English) Public Grievance Redressal Platform featuring:
- **Mobile App**: React Native (Expo SDK 52) supporting iOS, Android, and responsive Web with Tamil (`ta`) & English (`en`) i18n.
- **Backend API**: Python Django 5 + Django REST Framework + SimpleJWT + Email OTP Service.
- **Database**: MySQL 8.0 (`utf8mb4` for full Tamil Unicode support, InnoDB transactions, indexed queries).
- **3 Role Panels**: Citizen (User), Officer, and Admin.

## Quick Start (Docker)
```bash
docker compose up --build
```

## Manual Local Setup

### 1. MySQL Database
```bash
mysql -u root -p < backend-django/schema.sql
```

### 2. Python Django Backend
```bash
cd backend-django
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### 3. React Native (Expo) Mobile App
```bash
cd mobile-expo
npm install
npx expo start
```
