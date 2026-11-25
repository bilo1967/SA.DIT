# Configurazione SA.DIT

La finestra **Impostazioni** modifica due file JSON esterni: `signaling.json` (rete, condivisibile tra PC) e `preferences.json` (dispositivi e ruolo del singolo PC).

Per **ogni file**, SA.DIT cerca in ordine:

1. `%APPDATA%\\SA.DIT\\` (prima scelta)
2. Directory che contiene `SA.DIT.exe` (fallback portable)

Se entrambe le copie esistono, prevale AppData. Le modifiche vengono salvate **nella stessa posizione** da cui è stato letto il file. Se il file non è presente da nessuna parte, si usano valori predefiniti e il primo salvataggio crea il file in AppData. Chi vuole una distribuzione portable può distribuire i JSON accanto all'EXE **prima del primo salvataggio**. La ricerca non dipende dalla directory corrente del processo.

Conservare le credenziali TURN in una directory accessibile soltanto agli utenti autorizzati: il JSON non è cifrato.

## signaling.json (comune alle due modalità)

```json
{
  "host": "peerjs2.ditlab.it",
  "port": 443,
  "path": "/",
  "secure": true,
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:stun1.l.google.com:19302" },
    { "urls": "turns:ice.ditlab.it:443", "username": "YOUR_USERNAME", "credential": "YOUR_PASSWORD" },
    { "urls": "turns:ice2.ditlab.it:5349", "username": "YOUR_USERNAME", "credential": "YOUR_PASSWORD" }
  ]
}
```

Questa configurazione illustra il server privato già disponibile per il progetto. Non inserire credenziali reali nei commit o in messaggi pubblici. Il valore predefinito nell'app è invece `0.peerjs.com:443` su TLS, path `/`, due server Google STUN e nessun TURN.

## preferences.json (locale al PC)

```json
{
  "role": "receive",
  "inputDeviceId": "",
  "outputDeviceId": ""
}
```

Una stringa vuota seleziona il dispositivo predefinito di Windows. Gli identificativi dei dispositivi potrebbero cambiare dopo aggiornamenti hardware, reinstallazioni o modifiche ai permessi.

## Stato della funzionalità

Questa fase implementa **l'editor di configurazione** e l'uso dei server ICE nella connessione WebRTC manuale. **Non** è ancora integrato il signaling PeerJS/PIN, quindi modificare `host`, `port`, `path` e `secure` non cambia la procedura di connessione del prototipo. I parametri ICE vengono letti quando si crea una nuova sessione.

L'interprete può impostare il dispositivo audio di uscita; il PC di sala quello di ingresso. La scelta si applica alla sessione successiva e può richiedere autorizzazione alla cattura.

Le credenziali TURN sono memorizzate in chiaro nella configurazione locale dell'utente (non vengono crittografate). Usare credenziali temporanee è preferibile, soprattutto in distribuzioni pubbliche.
