
// server.js
import express from "express"
import dotenv from "dotenv"
import mongoose from "mongoose";

// Carrega as variáveis de ambiente
dotenv.config();


const app = express();
const PORT = process.env.PORT || 5000;

// definindo a função de conexão com o banco de dados
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log("Conectado ao MongoDB")
    } catch (error) {
        console.log("Erro ao conectar com o MongoDB", error)
    }
}

// Executa a função de conexão com o banco de dados
connectDB();

// // Rota de teste
// app.get('/', (req, res) => {
//   res.send('API do AcadeMe está rodando...');
// });

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});