import type { BunFile } from "bun";
import sql from "bun:sqlite";
import path from "path";

const db = sql.open("./db.sqlite");
db.run(
  "CREATE TABLE IF NOT EXISTS downloads (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, downloads INTEGER, lastDownload INTEGER)"
);

const config = {
  port: 8080 || process.env.PORT,
  folder: path.resolve("./public" || process.env.FOLDER),
  adminPassword: "admin" || process.env.ADMIN_PASSWORD,
  resolveIndex: true,
};

Bun.serve({
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/")
      return new Response(Bun.file("./static/index.html"));

    if (url.pathname === "/admin") {
      if (req.method === "POST") {
        const body = await req.json();
        if (getPw(body) === config.adminPassword) {
          const stm = db.query("SELECT * FROM downloads");
          const ret = stm.all();
          return new Response(
            JSON.stringify(
              ret.map((x: any) => ({
                ...x,
                lastDownload: new Date(x.lastDownload).toLocaleString(),
              })),
              undefined,
              2
            )
          );
        }
      }
      return new Response("Unauthorized", { status: 401 });
    }

    const filePath = path.resolve(path.join(config.folder, url.pathname));
    if (!filePath.startsWith(config.folder))
      return new Response("404", { status: 404 });
    const file = await resolveFile(url.pathname);
    if (file) {
      const filePath = path.resolve(url.pathname);
      const stm = db.query("SELECT * FROM downloads WHERE name = ?");
      const ret = stm.get(filePath);
      const downloads = Number(
        typeof ret === "object" && ret && "downloads" in ret ? ret.downloads : 0
      );
      if (downloads) {
        db.run(
          "UPDATE downloads SET downloads = ?, lastDownload = ? WHERE name = ?",
          [downloads + 1, Date.now(), filePath]
        );
      } else {
        db.run(
          "INSERT INTO downloads (name, downloads, lastDownload) VALUES (?, ?, ?)",
          [filePath, downloads + 1, Date.now()]
        );
      }
      return new Response(file);
    }

    return new Response("404", { status: 404 });
  },
  port: config.port,
});

const resolveFile = async (url: string): Promise<BunFile | undefined> => {
  const filePath = path.resolve(path.join(config.folder, url));
  if (
    (filePath.endsWith("/") || !(await Bun.file(filePath).exists())) &&
    config.resolveIndex
  ) {
    const index = ["index.html", "index.htm", "default.html", "default.htm"];
    for (const file of index) {
      const file2 = path.resolve(path.join(filePath, file));
      if (file2.startsWith(config.folder)) {
        const file3 = Bun.file(file2);
        if (await file3.exists()) return file3;
      }
    }
  }
  if (!filePath.startsWith(config.folder)) return undefined;
  return Bun.file(filePath);
};

const getPw = (body: unknown) => {
  if (typeof body === "object" && body && "password" in body)
    return body.password;
  return null;
};
