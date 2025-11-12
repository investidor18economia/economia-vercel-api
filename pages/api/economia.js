export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    message: "Rota de economia funcionando!",
    data: {
      PIB: "3.2%",
      inflação: "4.5%",
      desemprego: "7.8%",
    },
  });
}
