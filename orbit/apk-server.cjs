const http = require("http");
const fs = require("fs");
const f = "C:\\Users\\Geoffrey O Kodjo\\Desktop\\Orbit.apk";
http.createServer((req, res) => {
  if (req.url.startsWith("/Orbit.apk")) {
    res.writeHead(200, { "Content-Type": "application/vnd.android.package-archive", "Content-Disposition": "attachment; filename=Orbit.apk" });
    fs.createReadStream(f).pipe(res);
  } else if (req.url === "/") {
    const ip = require("os").networkInterfaces();
    res.writeHead(200, {"Content-Type":"text/html"});
    res.end("<h1>Tap to download Orbit.apk</h1><a href='/Orbit.apk' style='font-size:22px'>Download Orbit.apk</a>");
  } else { res.writeHead(404); res.end(); }
}).listen(8899, () => console.log("8899"));