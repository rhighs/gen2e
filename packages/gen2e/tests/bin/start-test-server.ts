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
