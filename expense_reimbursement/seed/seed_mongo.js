// ============================================================
// Expense Reimbursement Demo — MongoDB seed script
// Database: expense_db  Collection: policies
//
// Run inside container:
//   docker exec -i <container> mongosh --eval "$(cat seed_mongo.js)"
// Or via mongosh directly:
//   mongosh mongodb://localhost:27017 seed_mongo.js
// ============================================================

const db = connect("mongodb://root:rootpass@localhost:27017/expense_db?authSource=admin");

db.policies.drop();

// _id is set to the category string so that the MongoTableProvider returns the
// correct string value when reading the primary_key ("category") field.
// Without this, MongoDB's auto-generated ObjectId would be returned instead.
db.policies.insertMany([
  {
    _id: "Travel",
    category: "Travel",
    per_claim_limit: 500.0,
    monthly_limit: 2000.0,
    requires_receipt: true,
    notes: "Includes flights, hotels, car rental. International travel needs pre-approval."
  },
  {
    _id: "Meals & Entertainment",
    category: "Meals & Entertainment",
    per_claim_limit: 200.0,
    monthly_limit: 800.0,
    requires_receipt: true,
    notes: "Business purpose and attendee list required for amounts over $50."
  },
  {
    _id: "Office Supplies",
    category: "Office Supplies",
    per_claim_limit: 100.0,
    monthly_limit: 500.0,
    requires_receipt: false,
    notes: "Amounts under $25 require no receipt."
  },
  {
    _id: "Software & Subscriptions",
    category: "Software & Subscriptions",
    per_claim_limit: 300.0,
    monthly_limit: 1000.0,
    requires_receipt: true,
    notes: "Annual subscriptions must be approved by department head."
  },
  {
    _id: "Training & Education",
    category: "Training & Education",
    per_claim_limit: 1000.0,
    monthly_limit: 3000.0,
    requires_receipt: true,
    notes: "Course, conference, and certification fees. Manager pre-approval required."
  }
]);

print("Inserted " + db.policies.countDocuments() + " policy documents.");
print("Sample document:");
printjson(db.policies.findOne({ category: "Travel" }));
