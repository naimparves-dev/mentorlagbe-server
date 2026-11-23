# MentorLagbe — Backend API Server (`mentorlagbe-server`)

Standalone Express.js + MongoDB + JWT + Stripe backend for the **MentorLagbe** Smart Tuition & Mentorship Platform. Designed to be deployed independently to GitHub and Vercel.

## Folder Structure
```
mentorlagbe-server/
├── src/
│   ├── config/ (db.js, env.js, stripe.js)
│   ├── middleware/ (auth.js, errorHandler.js, notFound.js)
│   ├── routes/ (users, tuitions, applications, admin, payments, index.js)
│   ├── utils/asyncHandler.js
│   ├── app.js
│   └── index.js
├── .env.example
├── .gitignore
├── vercel.json
└── package.json
```

## Setup & Run (Port 5000)
```powershell
cp .env.example .env
# Fill in DB_URI, CLIENT_URL, JWT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
npm install
npm run dev
```

## Managing Roles & Data Directly in MongoDB
1. Register your accounts normally from the frontend `/sign-up` page.
2. Open MongoDB Atlas or MongoDB Compass → database `mentorlagbe` → `users` collection.
3. Change any user's `role` to `"admin"` (or `"tutor"` / `"student"`) and `plan` to `"pro"` directly in the database.
4. Add or moderate `tuitions`, `applications`, and `payments` either via the app dashboards or directly in MongoDB.
