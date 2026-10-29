# TK Tech

A responsive laptop storefront branded **TK Tech by Taimur Khan**, built with React, Vite, Express, and SQLite.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set a private admin password of at least 12 characters.
4. Run `npm run dev` to start the storefront and local API/database server.
5. Open the Vite URL. The separate admin login is at `/admin`.

For a production preview, run `npm run build` followed by `npm run preview`; preview also starts the API.

## Deploy on Vercel

Vercel serves the Vite storefront and the `api/` serverless routes. The Vercel API uses Neon Postgres because the local SQLite file is not persistent across serverless function instances.

1. In Vercel, connect a Neon Postgres database to this project from the Marketplace. The integration supplies `DATABASE_URL`.
2. Add `TK_ADMIN_USERNAME` and `TK_ADMIN_PASSWORD` as Vercel environment variables for Production and Preview. Use a password of at least 12 characters.
3. Redeploy. The API creates its tables and sample laptop catalog on the first request. The admin panel is available at `/admin`.

The Neon database created for Vercel is separate from `server/data/catalog.sqlite` on this computer. Products, customer accounts, newsletter subscriptions, and uploaded image data are not copied automatically between them.

## Admin and catalog

The admin portal has its own login, separate from customer accounts. Configure `TK_ADMIN_USERNAME` and `TK_ADMIN_PASSWORD` in the ignored local `.env` file. Keep `.env` private and change the placeholder password before sharing the computer. The `/admin` panel supports viewing, adding, editing, and deleting laptop listings. Product write API requests require an admin session.

Catalog records are stored in `server/data/catalog.sqlite`. Laptop photos selected from the device are resized in the browser and saved under `server/data/uploads`. Older custom listings still saved in this browser can be imported from the admin panel after signing in.

Customer sign-up/sign-in uses separate accounts in the same SQLite database. Customer passwords are scrypt-hashed and their sessions use HTTP-only, same-site cookies. Email verification and password recovery are not configured; account profiles do not yet include order history or saved items.

The local API listens on localhost only. Sales, inventory, and customer order history are not implemented. Sample product prices are illustrative, not live offers or verified reviews. Sample product photography is loaded from Unsplash and requires an internet connection. Back up `server/data` to preserve the local database and uploaded photos.
