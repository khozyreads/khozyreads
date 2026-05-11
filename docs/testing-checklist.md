# Testing Checklist

1. Set `APPS_SCRIPT_URL` in `assets/api-client.js`.
2. Open `index.html`.
3. Register buyer.
4. Login buyer.
5. Register seller account.
6. In Google Sheet `users`, change seller role to `seller`.
7. Login seller from `seller-login.html`.
8. Open `admin-settings.html` and save ABA/payment settings.
9. Add one dummy book in `admin-books.html`.
10. Click `View` on the book row and confirm book detail opens.
11. Add several episodes.
12. Buyer opens book detail.
13. Buyer clicks Buy Now.
14. Buyer uploads payment proof.
15. Confirm order appears in `admin-orders.html`.
16. Seller approves order.
17. Buyer opens `library.html`.
18. Buyer clicks Read Book.
19. Buyer can read all episodes.
20. Seller rejects another order and buyer sees rejected/upload-again status.
21. Guest opens book detail and sees Login to Buy.
22. Buyer without access opens reader and sees Buy Now prompt.
23. KH/EN language switch persists after refresh.
