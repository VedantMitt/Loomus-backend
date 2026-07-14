const id = "b7f9d854-47b2-4d22-b2f7-7b89f5bc3513"; // just a fake id
fetch(`http://localhost:5000/submissions/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ location: "test" })
}).then(async res => {
  console.log(res.status);
  console.log(await res.text());
}).catch(console.error);
