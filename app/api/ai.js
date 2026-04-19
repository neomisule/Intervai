export default async function handler(req, res) {
  const { prompt } = req.body;

  const response = await fetch("YOUR_TERPAI_URL", {
    method: "POST",
    headers: {
      "Authorization": `Bearer YOUR_API_KEY`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });

  const data = await response.json();
  res.json(data);
}