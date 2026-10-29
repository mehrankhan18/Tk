# TK Tech

A responsive laptop storefront branded **TK Tech by Taimur Khan**, built with React, Vite, Express, and SQLite.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set a private admin password of at least 12 characters.
4. Run `npm run dev` to start the storefront and local API/database server.
5. Open the Vite URL. The separate admin login is at `/admin`.

For a production preview, run `npm run build` followed by `npm run preview`; preview also starts the API.

## Admin and catalog

The admin portal has its own login, separate from customer accounts. Configure `TK_ADMIN_USERNAME` and `TK_ADMIN_PASSWORD` in the ignored local `.env` file; the example username is `admin`. Keep `.env` private and change the demo password before sharing the computer. The `/admin` panel supports viewing, adding, editing, and deleting laptop listings. Product write API requests require an admin session.

Catalog records are stored in `server/data/catalog.sqlite`. Laptop photos selected from the device are resized in the browser and saved under `server/data/uploads`. Older custom listings still saved in this browser can be imported from the admin panel after signing in.

Customer sign-up/sign-in uses separate accounts in the same SQLite database. Customer passwords are scrypt-hashed and their sessions use HTTP-only, same-site cookies. Email verification and password recovery are not configured; account profiles do not yet include order history or saved items.

The API and development server listen on localhost only. Do not expose them to the internet or an untrusted network. Sales, inventory, and customer order history are not implemented. Sample product prices are illustrative, not live offers or verified reviews. Sample product photography is loaded from Unsplash and requires an internet connection. Back up `server/data` to preserve the database and uploaded photos.
