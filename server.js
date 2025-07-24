const express = require('express');
const app = express();
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const MongoStore = require('connect-mongo');
require('dotenv').config();

app.use(express.static(__dirname + '/public'));
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(passport.initialize());
app.use(
  session({
    secret: '암호화에 쓸 비번',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 2 * 60 * 60 * 1000 },
    store: MongoStore.create({
      mongoUrl: process.env.DB_URL,
      dbName: 'picatong-qr-order',
    }),
  })
);
app.use(passport.session());

const { MongoClient, ObjectId } = require('mongodb');

let db;
const url = process.env.DB_URL;
new MongoClient(url).connect().then((client) => {
    console.log('DB연결성공');
    db = client.db('picatong-qr-order');
    app.listen(process.env.PORT, () => {
      console.log('listening on ' + process.env.PORT);
    });
  })
  .catch((err) => {
    console.log(err);
  });

passport.use(
  new LocalStrategy({ usernameField: 'tableNum', passwordField: 'accessKey' }, async (tableNum, accessKey, done) => {
    try {
      const table = await db.collection('tables').findOne({ tableNum: parseInt(tableNum), accessKey: accessKey });
      if (!table) return done(null, false, { message: 'Invalid Table' });
      return done(null, table);
    } catch (e) {
      return done(e);
    }
  })
);

passport.serializeUser((table, done) => {
  process.nextTick(() => {
    done(null, { id: table._id, tableNum: table.tableNum });
  });
});

passport.deserializeUser(async (table, done) => {
  let result = await db.collection('tables').findOne({ _id: new ObjectId(table.id) });
  delete result.accessKey, result.isActive;
  process.nextTick(() => {
    done(null, result);
  });
});

app.get('/login', async (요청, 응답, next) => {
  const { table, key } = 요청.query; // QR을 통해 ?table=4&key=abc123 접속할 것.
  passport.authenticate('local', (err, user, info) => {
    if (err) return 응답.status(500).json(err);
    if (!user) return 응답.status(401).json(info.message);
    요청.logIn(user, (err) => {
      if (err) return next(err);
      응답.redirect('/menu');
    });
  })({ body: { tableNum: table, accessKey: key } }, 응답, next);
});

function checkLogin(요청, 응답, next) {
  if (!요청.user) {
    응답.send('다시 QR을 찍어주세요.');
  }
  next();
}

app.use(checkLogin);

app.get('/', async (요청, 응답) => {
  let result = await db.collection('menus').find().toArray();
  응답.render('menu.ejs', { 메뉴목록: result });
});

app.get('/order-detail/:id', async (요청, 응답) => {
  try {
    let result = await db.collection('orders').findOne({ tableId: new ObjectId(요청.params.id) });
    응답.render('order-detail.ejs', { orders: result });
  } catch {
    응답.status(404).send('이상한 url 입력함');
  }
});
// ------ 관리자 페이지 ------ //

app.get('/admin/menu', async (요청, 응답) => {
  let result = await db.collection('menus').find().toArray();
  응답.render('admin-menu.ejs', { menus: result });
});
