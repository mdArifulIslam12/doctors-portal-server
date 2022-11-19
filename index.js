const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion,ObjectId } = require("mongodb");
const { application } = require("express");
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hnhet.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// Json wed token verify function
function verifyJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorization access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("doctor").collection("service");
    const bookingsCollection = client.db("doctor").collection("bookings");
    const usersCollection = client.db("doctor").collection("users");
    const doctorsCollection = client.db("doctor").collection("doctors");
    const paymentCollection = client.db("doctor").collection("payment");

    const verifyAdmin = async(req,res,next)=>{
      const decodedEmail = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: decodedEmail,
      });
      if (requesterAccount.role === "Admin") {
        next()
      }else {
        res.status(403).send({ message: "forbidden access" });
      }
    }

    app.get("/service", async (req, res) => {
      const query = {};
      const curos = serviceCollection.find(query).project({name:1});
      const services = await curos.toArray();
      res.send(services);
    });
    // Get Admin
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "Admin";
      res.send({ admin: isAdmin });
    });

    // Put Make Admin setup for database
    app.put("/user/admin/:email", verifyJwt,verifyAdmin, async (req, res) => {
      const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "Admin" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
     
    });
    // Get user
    app.get("/user", verifyJwt, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.delete('/user/:id',async(req,res)=>{
      const id = req.params.id
      const filter = {_id:ObjectId(id)}
      const result = await usersCollection.deleteOne(filter)
      res.send(result)
    })
    // Put login or singup for database setup or Json web token create
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        {
          expiresIn: "4h",
        }
      );
      res.send({ result, token });
    });

    // Booking service slot to service slot time delete or service collection
    app.get("/available", async (req, res) => {
      const date = req.query.date;
      const services = await serviceCollection.find().toArray();
      const query = { date: date };
      const bookings = await bookingsCollection.find(query).toArray();
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (booking) => booking.treatment === service.name
        );
        const booked = serviceBookings.map((s) => s.slot);
        const available = service.slots.filter((s) => !booked.includes(s));
        service.slots = available;
      });

      res.send(services);
    });
    // Booking service Get
    app.get("/booking", verifyJwt, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email === decodedEmail) {
        const query = { patientEmail: email };
        const result = await bookingsCollection.find(query).toArray();
        return res.send(result);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });
    // Service Booking Post
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patientEmail: booking.patientEmail,
      };
      const exists = await bookingsCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingsCollection.insertOne(booking);
      return res.send({ success: true, result });
    });

    app.patch('/booking/:id',verifyJwt,async(req,res)=>{
      const id = req.params.id 
      const filter = {_id:ObjectId(id)}
      const paymentId = req.body
      const updatedDoc = {
        $set:{
          paid:true,
          transactionId:paymentId.transactionId
        }
      }
      const updateBooking = await bookingsCollection.updateOne(filter,updatedDoc)
      const result = await paymentCollection.insertOne(paymentId)
      res.send(updateBooking)
    })
    //  Doctor
    app.get('/doctor',verifyJwt,verifyAdmin,async(req,res)=>{
      const doctors = await doctorsCollection.find().toArray()
      res.send(doctors)
    });
    app.post('/doctor',verifyJwt,verifyAdmin,async(req,res)=>{
      const doctor = req.body
      const result = await doctorsCollection.insertOne(doctor)
      res.send(result)
    });
    app.delete('/doctor/:email',verifyJwt,verifyAdmin,async(req,res)=>{
      const doctor = req.params.email
      const filter = {email:doctor}
      const result = await doctorsCollection.deleteOne(filter)
      res.send(result)
    })

    /// Payment 
    app.get('/booking/:id',async(req,res)=>{
      const id = req.params.id 
      const filter = {_id:ObjectId(id)}
      const result = await bookingsCollection.findOne(filter)
      res.send(result)
    })

    app.post('/create-payment-intent',verifyJwt,async(req,res)=>{
      const service = req.body
      const price  = service.price
      const amount = price*100 
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types:['card'],
      });
      res.send({clientSecret: paymentIntent.client_secret});
    })

  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Doctor app listening on port ${port}`);
});
