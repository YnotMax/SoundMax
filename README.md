<div align="center">
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Electron.svg" width="60" height="60" alt="Electron">
  <h1>SoundMax — Premium Soundboard</h1>
  <p><strong>Um Soundboard moderno e sem latência, projetado para Gamers, Streamers e Trolls de plantão.</strong></p>
  <hr>
</div>

O **SoundMax** é uma aplicação construída com Electron e Web Audio API que permite que você toque áudios, músicas e memes no seu microfone durante chamadas do Discord, jogos ou gravações, **sem** a necessidade de configurações complexas no VoiceMeeter.

## ✨ Recursos

* **⚡ Mixagem em Tempo Real:** Mixa a sua voz com os sons do aplicativo utilizando o motor nativo do navegador (Chromium Web Audio API), acabando com os engasgos de driver do Windows.
* **🎨 Design Moderno (Neo-Brutalism/Dark):** Interface premium, limpa e com atalhos de teclado globais.
* **📂 Armazenamento Interno Inteligente:** Arraste e solte seus MP3s! O aplicativo copia e gerencia os arquivos em uma biblioteca interna portátil.
* **📊 Analisadores Visuais (VU Meter):** Barras azuis e verdes que mostram, em tempo real, se a sua voz e a saída do VB-Cable estão recebendo o som perfeitamente.
* **🎮 Atalhos Globais (Hotkeys):** Configure uma tecla para tocar qualquer som, mesmo quando estiver dentro do seu jogo.

## 🛠️ Tecnologias Utilizadas

* **[Electron](https://www.electronjs.org/)** - O framework base para a aplicação Desktop.
* **[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)** - Motor avançado e de baixíssima latência (Zero C++ ou PortAudio envolvido).
* **HTML5, CSS Vanilla e Javascript Nativo** - Frontend leve e super-responsivo.

## 🚀 Como Instalar e Usar

### 1. Pré-Requisito (Obrigatório)
Para que os seus amigos te escutem no Discord com a música, você precisará de um "cabo virtual".
* Baixe e instale o [VB-Audio Virtual Cable](https://vb-audio.com/Cable/) gratuitamente.

### 2. Configurando o SoundMax
* Faça o download da última versão em [Releases](#).
* Abra o `SoundMax.exe`.
* No painel lateral, em **Microfone**, escolha o seu microfone de verdade (o seu Headset).
* Em **Saída (VB-CABLE)**, selecione `CABLE Input`.
* Clique em **▶ Iniciar**. O motor começará a juntar a sua voz com os seus sons!

### 3. Configurando o Discord / Jogo
* Vá nas opções de voz do Discord.
* Altere o seu **Microfone (Dispositivo de Entrada)** para `CABLE Output`.
* Pronto! Tudo o que você falar e os sons que você clicar vão sair limpos para os seus amigos.

## 💻 Para Desenvolvedores (Rodar localmente)

Faça um clone deste repositório e rode os comandos:

```bash
# Instale as dependências
npm install

# Rode a aplicação
npm start

# Construa o executável de distribuição
npm run dist
```

## 📝 Licença
Desenvolvido por **Tony Max** durante o processo de migração de carreira. Licença MIT. Sinta-se à vontade para fazer forks e pull requests!
