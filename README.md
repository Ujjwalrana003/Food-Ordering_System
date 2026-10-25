# Food Ordering System

1. `npm install`
2. Copy `.env.example` to `.env` and fill in your MySQL password.
3. Run `database/schema.sql` in MySQL.
4. Run `npm run seed` (creates admin and sample menu, sets images, and adds missing
   menu and order columns)
5. `npm start` then open http://localhost:3000 (admin: /admin.html)

At checkout, customers can optionally choose a delivery pin on the OpenStreetMap map,
search for an area or landmark, or use their current location. Map tiles and location
search use OpenStreetMap services; search terms and selected coordinates are sent to
those services. The map requires an internet connection and browser location permission
for the current-location option.
Customers must provide a phone number when placing an order. Admins can view it and
the order date in the Orders tab. At startup, the app adds missing order columns,
including the phone number and nullable delivery coordinates, to an existing database.
Admins can open the saved pin from the Orders tab.

Images: dish pictures live in `public/images/menu/`. Replace any file with your own photo
or upload one from Admin > Menu > Edit. Uploads are saved in `public/images/uploads/`.
