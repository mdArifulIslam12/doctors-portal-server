const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri =
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hnhet.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db("doctor").collection("service");
        const bookingsCollection = client.db("doctor").collection("bookings");
        const usersCollection = client.db("doctor").collection("users");


        app.get('/service',async(req,res)=>{
            const query = {}
            const curos = serviceCollection.find(query)
            const services = await curos.toArray()
            res.send(services)
        })

        app.get('/available', async(req,res)=>{
          const date = req.query.date 
          const services = await serviceCollection.find().toArray()
          const query = {date:date}
          const bookings = await bookingsCollection.find(query).toArray()
          services.forEach(service=>{
          const serviceBookings = bookings.filter(booking => booking.treatment === service.name)
          const booked = serviceBookings.map(s => s.slot)
          const available = service.slots.filter(s => !booked.includes(s))
          service.slots = available
         })
       
          res.send(services)

        })


        app.post('/booking', async(req,res)=>{
          const booking = req.body;
          const query = {
            treatment:booking.treatment,
            date:booking.date,
            patientEmail:booking.patientEmail
          }
          const exists = await bookingsCollection.findOne(query)
          if(exists){
            return res.send({success: false, booking:exists})
          }
          const result = await bookingsCollection.insertOne(booking)
         return res.send({success:true, result})
        })
        app.get('/myAppointment',async(req,res)=>{
          const email = req.query.email
          const query = {patientEmail:email}
          const result = await bookingsCollection.find(query).toArray()
          res.send(result)

        })

    }
    finally{}
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Doctor app listening on port ${port}`);
});
