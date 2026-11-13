import { serve } from "@hono/node-server";
import { Hono } from "hono";

export const startServer = (port: number) => {
  const app = new Hono();

  app.get("/", (c) =>
    c.html(`<html>
  <body>
    <h1>Hello, Gen2E!</h1>
    <form id="search">
      <label>Search</label>
      <input type="text" name="query" data-testid="search-input" />
    </form>
    <div id="click-counter">
      <p>Click count: <span id="current-count" data-testid="current-count">0</span></p>
      <button id="click-button">Click me</button>
      <script>
      const clickButton = document.getElementById("click-button");
      const currentCount = document.getElementById("current-count");
      let clickCount = 0;
      clickButton.addEventListener("click", () => {
        currentCount.innerText = ++clickCount;
      });
      </script>
    </div>
  </body>
</html>`),
  );

  app.get("/iframe", (c) =>
    c.html(`<html>
  <body>
    <h1>Iframe parent</h1>
    <iframe id="child-frame" name="child-frame" src="/frame-child"></iframe>
  </body>
</html>`),
  );

  app.get("/frame-child", (c) =>
    c.html(`<html>
  <body>
    <p id="frame-text">frame child</p>
  </body>
</html>`),
  );

  app.get("/login", (c) =>
    c.html(`<html>
  <body>
    <main>
      <h2>Account</h2>
      <form id="login">
        <label for="u">Email address</label>
        <input id="u" type="email" autocomplete="username" />
        <label for="p">Password</label>
        <input id="p" type="password" autocomplete="current-password" />
        <button type="button">Forgot password?</button>
        <button type="submit">Sign in</button>
      </form>
      <p id="status" role="status"></p>
    </main>
    <script>
      document.getElementById("login").addEventListener("submit", (e) => {
        e.preventDefault();
        const user = document.getElementById("u").value;
        const ok = user && document.getElementById("p").value.length >= 8;
        document.getElementById("status").innerText = ok ? "Welcome, " + user : "Invalid credentials";
      });
    </script>
  </body>
</html>`),
  );

  app.get("/products", (c) =>
    c.html(`<html>
  <body>
    <h2>Inventory</h2>
    <table>
      <thead><tr><th>Product</th><th>Price</th><th>Stock</th></tr></thead>
      <tbody>
        <tr><td>Red Mug</td><td>$9.00</td><td>14</td></tr>
        <tr><td>Blue Mug</td><td>$12.50</td><td>0</td></tr>
        <tr><td>Green Mug</td><td>$11.00</td><td>3</td></tr>
        <tr><td>Blue Plate</td><td>$18.25</td><td>0</td></tr>
        <tr><td>Teapot</td><td>$42.00</td><td>7</td></tr>
      </tbody>
    </table>
  </body>
</html>`),
  );

  app.get("/consent", (c) =>
    c.html(`<html>
  <body>
    <div id="banner" style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:end">
      <div style="background:#fff;padding:16px;width:100%">
        We use cookies to improve your experience.
        <button onclick="document.getElementById('banner').remove()">Accept all</button>
        <button>Customize</button>
      </div>
    </div>
    <h2>Newsletter</h2>
    <button onclick="document.getElementById('sub').innerText='Subscribed'">Subscribe</button>
    <p id="sub"></p>
  </body>
</html>`),
  );

  app.get("/delayed", (c) =>
    c.html(`<html>
  <body>
    <h2>Search results</h2>
    <p id="results">Loading…</p>
    <script>
      setTimeout(() => {
        document.getElementById("results").innerText = "3 results found";
      }, 1200);
    </script>
  </body>
</html>`),
  );

  app.get("/select", (c) =>
    c.html(`<html>
  <body>
    <label for="country">Country</label>
    <select id="country">
      <option value="">Choose…</option>
      <option value="fr">France</option>
      <option value="it">Italy</option>
      <option value="es">Spain</option>
    </select>
  </body>
</html>`),
  );

  app.get("/cards", (c) =>
    c.html(`<html>
  <body>
    <div id="cards">
      <section class="card"><h3>Draft: Q3 report</h3><button onclick="this.closest('.card').remove()">Delete</button></section>
      <section class="card"><h3>Draft: Hiring plan</h3><button onclick="this.closest('.card').remove()">Delete</button></section>
      <section class="card"><h3>Draft: Offsite agenda</h3><button onclick="this.closest('.card').remove()">Delete</button></section>
    </div>
    <p id="count"></p>
    <script>
      const render = () => {
        const titles = [...document.querySelectorAll("#cards h3")].map((h) => h.innerText.replace("Draft: ", ""));
        document.getElementById("count").innerText = titles.length + " drafts: " + titles.join(", ");
      };
      new MutationObserver(render).observe(document.getElementById("cards"), { childList: true });
      render();
    </script>
  </body>
</html>`),
  );

  app.get("/shadow", (c) =>
    c.html(`<html>
  <body>
    <h2>Widget</h2>
    <rating-widget></rating-widget>
    <p id="rating"></p>
    <script>
      customElements.define("rating-widget", class extends HTMLElement {
        connectedCallback() {
          const root = this.attachShadow({ mode: "open" });
          root.innerHTML = '<span>Rate us:</span>' + [1, 2, 3, 4, 5]
            .map((n) => '<button aria-label="' + n + ' stars">★</button>').join("");
          root.querySelectorAll("button").forEach((b, i) =>
            b.addEventListener("click", () => { document.getElementById("rating").innerText = String(i + 1); }));
        }
      });
    </script>
  </body>
</html>`),
  );

  app.get("/settings", (c) =>
    c.html(`<html>
  <body>
    <button onclick="document.getElementById('dlg').showModal()">Open settings</button>
    <p>Theme: <span id="theme">light</span></p>
    <dialog id="dlg">
      <h3>Settings</h3>
      <label><input type="checkbox" id="dark" /> Dark mode</label>
      <label><input type="checkbox" /> Compact layout</label>
      <button onclick="document.getElementById('dlg').close()">Cancel</button>
      <button onclick="document.getElementById('theme').innerText = document.getElementById('dark').checked ? 'dark' : 'light'; document.getElementById('dlg').close()">Save</button>
    </dialog>
  </body>
</html>`),
  );

  return new Promise((resolve) => {
    const server = serve(
      {
        fetch: app.fetch,
        port,
      },
      (info) => {
        resolve({
          close: () => {
            server.close();
          },
          port: info.port,
        });
      },
    );
  });
};

startServer(9999);
