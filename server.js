const express = require("express");
const app = express();
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

app.use(express.static(__dirname + "/public"));
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const MongoStore = require("connect-mongo");

const { createServer } = require("http");
const { Server } = require("socket.io");
const server = createServer(app);
const io = new Server(server);

io.on("connection", (socket) => {
  socket.on("joinOrderRoom", (orderId) => {
    socket.join(orderId);
  });
  // ── 메뉴 업데이트(menuUpdated) 로직 ──
  socket.on("menuUpdated", (updatedMenu) => {
    // 모든 손님(관리자 본인 제외)에 브로드캐스트
    socket.broadcast.emit("menuUpdated", updatedMenu);
  });
});

app.use(passport.initialize());
app.use(
  session({
    secret: "암호화에 쓸 비번",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 60 * 60 * 1000 },
    store: MongoStore.create({
      mongoUrl: process.env.DB_URL,
      dbName: "picatong-qr-order",
    }),
  })
);
app.use(passport.session());

const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = new S3Client({
  region: "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "lemonpesto-qrorder",
    key: function (요청, file, cb) {
      cb(null, Date.now().toString()); //업로드시 파일명 변경가능
    },
  }),
});

let connectDB = require("./database.js");

let db;
connectDB
  .then((client) => {
    console.log("DB연결성공");
    db = client.db("picatong-qr-order");
    const port = process.env.PORT || 8080;
    server.listen(port, () => {
      console.log("listening on " + port);
    });
  })
  .catch((err) => {
    console.log(err);
  });

passport.use(
  new LocalStrategy({ usernameField: "tableNum", passwordField: "accessKey" }, async (tableNum, accessKey, done) => {
    try {
      // 1) admin 로그인
      if (tableNum === "admin") {
        const admin = await db.collection("admins").findOne({ accessKey });
        if (!admin) return done(null, false, { message: "Invalid Admin Key" });
        return done(null, { id: admin._id, role: "admin" });
      }
      const table = await db.collection("tables").findOne({ tableNum: parseInt(tableNum), accessKey: accessKey });
      if (!table) return done(null, false, { message: "Invalid Table" });
      return done(null, { id: table._id, role: "user", tableNum: table.tableNum });
    } catch (e) {
      return done(e);
    }
  })
);

passport.serializeUser((user, done) => {
  process.nextTick(() => {
    done(null, { id: user.id, role: user.role, tableNum: user.tableNum });
  });
});

passport.deserializeUser(async (sessionUser, done) => {
  try {
    if (sessionUser.role === "admin") {
      const admin = await db.collection("admins").findOne({ _id: new ObjectId(sessionUser.id) });
      if (!admin) return done(null, false);
      return done(null, { ...admin, role: "admin" });
    }

    const table = await db.collection("tables").findOne({ _id: new ObjectId(sessionUser.id) });
    if (!table) return done(null, false);
    return done(null, { ...table, role: "user", tableNum: sessionUser.tableNum });
  } catch (e) {
    return done(e);
  }
});

// GET / 요청에 200 OK 리턴
app.get("/", (req, res) => res.send("OK"));

// --- 로그인 라우트 (/login?role=admin&key=xxx 또는 /login?table=4&key=abc123) --- //
app.get("/login", async (요청, 응답, next) => {
  const { role, table, key } = 요청.query;
  const credentials = {
    tableNum: role === "admin" ? "admin" : table,
    accessKey: key,
  };
  passport.authenticate("local", (err, user, info) => {
    if (err) return 응답.status(500).json(err);
    if (!user) return 응답.status(401).json(info.message);
    요청.logIn(user, (err) => {
      if (err) return next(err);
      // 로그인 후 리다이렉트 분기
      if (user.role === "admin") return 응답.redirect("/admin/menu");
      return 응답.redirect("/menu");
    });
  })({ body: credentials }, 응답, next);
});

// --- 로그인 미들 웨어 --- //
function checkLogin(req, res, next) {
  if (!req.user || req.user.role !== "user") {
    return res.status(401).send("QR을 다시 찍어주세요.");
  }
  res.locals.tableNum = req.user.tableNum;
  next();
}

function checkAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(401).send("QR을 다시 찍어주세요.");
  }
  next();
}

// ------ 관리자 페이지 ------ //
const adminRouter = require("./routes/admin")(io);
app.use("/admin", checkAdmin, adminRouter);

// ------ 손님 페이지 ------ //
app.use(checkLogin);
app.get("/menu", async (요청, 응답) => {
  try {
    const menus = await db.collection("menus").find().toArray();
    const categories = await db.collection("categories").find().sort({ order: 1 }).toArray();
    응답.render("menu.ejs", { menus, categories });
  } catch (e) {
    console.error(e);
    응답.status(500).send("서버 오류");
  }
});

// 메뉴 페이지
app.post("/cart/add", async (요청, 응답) => {
  const tableId = 요청.user._id;
  const menuId = new ObjectId(요청.query.menuid);
  const { name, price, qty, comment } = 요청.body;

  const item = await db.collection("cart").findOne({ tableId: tableId, menuId: new ObjectId(menuId), comment: comment || null });
  const menu = await db.collection("menus").findOne({ _id: menuId });

  if (item) {
    // 이미 담은 메뉴라면
    let totalQty = item.qty + parseInt(qty);
    await db.collection("cart").updateOne({ tableId: tableId, menuId: menuId }, { $set: { qty: totalQty } });
  } else {
    await db.collection("cart").insertOne({
      tableId: tableId,
      menuId: menuId,
      menuName: name,
      price: parseInt(price),
      manufacturing: menu.manufacturing,
      qty: parseInt(qty),
      comment: comment || null,
    });
  }
  응답.send("메뉴를 추가했습니다.");
});

app.get("/cart/summary", async (요청, 응답) => {
  try {
    const tableId = 요청.user._id;
    const items = await db
      .collection("cart")
      .find({ tableId: new ObjectId(tableId) })
      .toArray();

    const count = items.reduce((sum, it) => sum + it.qty, 0);
    const total = items.reduce((sum, it) => sum + it.price * it.qty, 0);

    return 응답.json({ count, total });
  } catch (e) {
    console.error(e);
    return 응답.json({ count: 0, total: 0 });
  }
});

// 장바구니 보기 페이지
app.get("/cart", async (요청, 응답) => {
  const tableId = 요청.user._id;
  try {
    let result = await db
      .collection("cart")
      .find({ tableId: new ObjectId(tableId) })
      .toArray();
    응답.render("cart.ejs", { menus: result, navTitle: "장바구니", navBack: "/menu" });
  } catch (e) {
    console.error(e);
    응답.status(500).send("서버 오류");
  }
});

app.post("/cart/update", async (요청, 응답) => {
  const menuId = 요청.query.menuid;
  const qty = parseInt(요청.body.qty);
  const tableId = 요청.user._id;

  let tmp = await db.collection("cart").findOne({ tableId: tableId });

  const result = await db.collection("cart").updateOne({ tableId: tableId, menuId: new ObjectId(menuId) }, { $set: { qty: qty } });

  if (result.modifiedCount === 0) {
    응답.status(404).send("해당 항목을 찾을 수 없습니다.");
  } else {
    응답.send("메뉴의 수량을 변경했습니다.");
  }
});

app.delete("/cart/delete", async (요청, 응답) => {
  const menuId = 요청.query.menuid;
  const tableId = 요청.user._id;

  const result = await db.collection("cart").deleteOne({
    tableId: new ObjectId(tableId),
    menuId: new ObjectId(menuId),
  });

  if (result.deletedCount === 0) {
    응답.status(404).send("삭제할 항목이 없습니다.");
  } else {
    응답.send("메뉴를 삭제했습니다.");
  }
});

// 결제 페이지
app.get("/payment", async (요청, 응답) => {
  try {
    const tableId = 요청.user._id; // 현재 사용자의 tableId

    // 장바구니의 총합 계산
    const cartItems = await db
      .collection("cart")
      .find({ tableId: new ObjectId(tableId) })
      .toArray();

    const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);

    응답.render("payment.ejs", { total, navTitle: "결제", navBack: "/cart" });
  } catch (err) {
    console.error("💥 결제 페이지 오류:", err);
    응답.status(500).send("결제 페이지를 불러오지 못했습니다.");
  }
});

// 결제 확인 페이지
app.post("/payment/confirm", async (요청, 응답) => {
  try {
    // 유저 장바구니에서 항목 가져오기
    const cartItems = await db.collection("cart").find({ tableId: 요청.user._id }).toArray();
    if (cartItems.length === 0) {
      return 응답.status(400).send("장바구니가 비어 있습니다.");
    }

    // 총 금액 계산
    const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    // 주문 데이터 구성
    const orderDoc = {
      // 기본 주문 정보
      tableNum: 요청.user.tableNum,
      items: cartItems.map((item) => ({
        menuId: item.menuId,
        menuName: item.menuName,
        price: item.price,
        manufacturing: item.manufacturing,
        qty: item.qty,
        cooked: false,
        comment: item.comment || null,
      })),
      total,

      // 상태 정보
      paid: false,
      completed: false,
      served: false,

      // 시간 정보
      requestedAt: new Date(), // 유저가 "송금했습니다" 버튼을 누른 시각
      confirmedAt: null, // 서버가 송금 확인을 누른 시각
      completedAt: null, // 주방에서 요리완성 누른 시각
      servedAt: null, // 서버가 서빙 완료 누른 시각
    };

    // 주문 저장
    const result = await db.collection("orders").insertOne(orderDoc);
    const orderId = result.insertedId.toString();

    io.emit("newOrder", {
      _id: orderId,
      tableNum: orderDoc.tableNum,
      items: orderDoc.items, // manufacturing 포함
      total: orderDoc.total,
      requestedAt: orderDoc.requestedAt,
    });

    // 장바구니 비우고 리다이렉트
    await db.collection("cart").deleteMany({ tableId: 요청.user._id });
    응답.redirect(`/payment/confirm?orderId=${orderId}`);
  } catch (err) {
    console.error("❌ 주문 저장 실패:", err);
    응답.status(500).send("서버 오류로 주문을 저장하지 못했습니다.");
  }
});

// 결제 확인 페이지
app.get("/payment/confirm", async (요청, 응답) => {
  try {
    응답.render("confirm.ejs", { navTitle: "결제확인" });
  } catch (err) {
    console.error("💥 /payment/confirm 오류:", err);
    응답.status(500).send("확인 페이지를 불러오는 중 오류가 발생했습니다.");
  }
});

// server.js
app.get("/payment/confirm-success", checkLogin, (req, res) => {
  res.render("confirm-success", { navTitle: "결제확인" });
});

app.get("/payment/confirm-cancel", checkLogin, (req, res) => {
  res.render("confirm-cancel", { navTitle: "결제확인" });
});

// 주문 내역 페이지
app.get("/orders/history", async (요청, 응답) => {
  const tableNum = 요청.user.tableNum;
  try {
    const orders = await db.collection("orders").find({ tableNum: tableNum }).sort({ requestedAt: -1 }).toArray();
    응답.render("orders-history", { orders });
  } catch {
    응답.status(404).send("주문내역 불러오는 중 에러");
  }
});
