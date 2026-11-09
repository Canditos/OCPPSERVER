# 🏃 Nightscout Audio Runner & Sports Carb Coach 🍬

Aplicação PWA concebida para corredores com diabetes que utilizam **Nightscout**, permitindo ouvir a glicemia e recomendações de hidratos de carbono nos auscultadores Bluetooth com o telemóvel no bolso e o ecrã bloqueado.

---

## ✨ Funcionalidades Principais

1. **Voz por Bluetooth a cada 2 minutos (ou configurável):**
   - Anuncia: Glicemia atual, seta de tendência e variação recente ($\Delta$ 5 min).
   - Voz natural em Português compatível com o motor de voz do Google Pixel 9 Pro XL.

2. **Treinador Inteligente de Hidratos de Carbono (Carb Coach para Corrida):**
   - **< 75 mg/dL**: Alerta urgente de hipoglicemia + parar + 15-20g HC rápidos.
   - **75 - 95 mg/dL a descer**: Aviso imediato para ingerir 15g de hidratos rápidos.
   - **95 - 120 mg/dL a descer**: Alerta de antecipação com 10-15g HC (gel/gomas).
   - **120 - 170 mg/dL estável**: Zona ideal de treino aeróbico (sem hidratos).
   - **> 170 mg/dL**: Alerta de hidratação com água e suspensão de hidratos.

3. **Compatível com Corrida no Bolso (Ecrã Bloqueado):**
   - Mantém o canal de áudio Bluetooth ativo com um ciclo contínuo em segundo plano (*Silent Keep-Alive*).
   - Suporte para **Media Session API**: a glicemia aparece no ecrã de bloqueio e na barra de notificações como se fosse uma música (`🩸 124 mg/dL →`).
   - Podes carregar no botão do auscultador Bluetooth (avançar faixa / saltar) para ouvir a glicemia a qualquer momento sem tirar o telemóvel do bolso.

---

## 🚀 Como Usar no Google Pixel 9 Pro XL

### Opção 1: Rede Local (Wi-Fi de casa)
1. O servidor já está a correr no teu computador.
2. No teu Pixel 9 Pro XL, abre o Chrome e vai ao endereço indicado no terminal (ex: `http://10.67.41.226:3000`).
3. Carrega em **"Iniciar Treino"**.

### Opção 2: Para Correr na Rua (4G/5G)
Para usares na rua com dados móveis sem depender do PC ligado em casa, podes hospedar os ficheiros da pasta `public/` gratuitamente em qualquer serviço de alojamento estático:
- **GitHub Pages** (gratuito)
- **Netlify / Vercel** (arrastar a pasta `public` e fica logo online com HTTPS)
- **Ou no teu próprio domínio**: ex. criar uma pasta ou subdomínio `runner.gatoescondido.com`.
