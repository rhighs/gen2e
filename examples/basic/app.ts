const page = `<!doctype html>
<html>
  <head><title>Todos</title></head>
  <body>
    <h1>Todos</h1>
    <form id="new">
      <input name="title" placeholder="What needs doing?" aria-label="New todo" />
      <button>Add</button>
    </form>
    <ul id="list"></ul>
    <p id="left">0 items left</p>
    <script>
      const list = document.getElementById("list");
      const left = document.getElementById("left");
      const count = () => {
        const n = list.querySelectorAll("input:not(:checked)").length;
        left.textContent = n + (n === 1 ? " item left" : " items left");
      };
      document.getElementById("new").addEventListener("submit", (e) => {
        e.preventDefault();
        const title = e.target.title.value.trim();
        if (!title) return;
        const li = document.createElement("li");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.addEventListener("change", count);
        label.append(box, " " + title);
        li.append(label);
        list.append(li);
        e.target.reset();
        count();
      });
    </script>
  </body>
</html>`;

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: () => new Response(page, { headers: { "content-type": "text/html" } }),
});

console.log(`listening on ${server.url}`);
