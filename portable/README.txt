SA.DIT - Sottotitolazione attiva
=================================

SA.DIT consente di trasmettere sottotitoli e comunicare fra due computer
attraverso la rete. I due ruoli sono "Interprete" e "Sala".

AVVIO RAPIDO
------------

1. Estrarre tutti i file dell'archivio in una cartella scrivibile.
   Non separare SA.DIT.exe dalle DLL e dalla cartella models.
2. Avviare SA.DIT.exe su entrambi i computer.
3. Selezionare il ruolo Interprete oppure Sala.
4. Sul computer Interprete scegliere una delle due modalita':
   - Riconoscimento vocale integrato: genera sottotitoli dal microfono
     con il modello italiano Kroko, in locale.
   - Riconoscimento vocale esterno: condivide una finestra di un'altra
     applicazione (per esempio, un programma di sottotitolazione).
5. Comunicare alla Sala il PIN a sei cifre visualizzato dall'Interprete.
6. In Sala inserire il PIN e premere Connettiti.

La Sala trasmette l'audio all'Interprete, che puo' ascoltarlo in cuffia.
Con il riconoscimento integrato, la Sala riceve il testo definitivo.
Con il riconoscimento esterno, riceve l'immagine della finestra condivisa.

FUNZIONI PRINCIPALI
-------------------

- Riconoscimento vocale in italiano con Kroko, senza inviare l'audio
  del microfono a servizi di trascrizione remoti.
- Visualizzazione locale dei risultati provvisori; proiezione del testo
  consolidato nella Sala.
- Comandi vocali personalizzabili per punteggiatura, maiuscole e a capo.
- "Pulisci sottotitoli" svuota la finestra dei sottotitoli in Sala
  e riparte con un nuovo testo, senza interrompere il riconoscimento.
- "Sospendi invio" interrompe solo la trasmissione dei sottotitoli,
  lasciando attivo il microfono e il riconoscimento. "Riprendi invio"
  torna a trasmettere i segmenti successivi: quelli pronunciati durante
  la sospensione non vengono inviati successivamente.
- Scelta del microfono dell'Interprete e delle cuffie in Setup.
- Scelta del microfono della Sala e cambio ingresso durante la sessione.
- Finestra di proiezione separata, riposizionabile e ridimensionabile.
  E' possibile nascondere la barra del titolo; nella modalita' di
  condivisione esterna e' disponibile anche il ritaglio dell'immagine.
- Chat testuale fra i due operatori.
- Configurazione locale conservata insieme all'applicazione.

Il riconoscimento Kroko e' offline. Per collegare Sala e Interprete,
invece, e' necessaria la connettivita' verso il server PeerJS e,
quando richiesto dalla rete, verso i server STUN/TURN configurati.
L'applicazione puo' inoltre richiedere accesso alla rete per caricare
alcune risorse dell'interfaccia.

CONFIGURAZIONE PORTABLE
-----------------------

Tutti i file di configurazione si trovano nella sottocartella "config",
accanto a SA.DIT.exe. Se mancano, vengono creati automaticamente al
primo avvio. I file esistenti non vengono sovrascritti.

config\signaling.json
  host       Nome del server di collegamento PeerJS.
  port       Porta del server.
  path       Percorso del servizio, normalmente "/".
  secure     true per usare una connessione protetta (TLS).
  iceServers Elenco dei server STUN/TURN; per TURN possono essere
             richiesti username e credential.
  Modificare questi valori solo se si utilizza un'infrastruttura
  di collegamento diversa da quella predefinita.
  Attenzione: eventuali credenziali TURN sono memorizzate in chiaro.

config\preferences.json
  role                       Ultimo ruolo selezionato.
  inputDeviceId              Microfono preferito della Sala.
  outputDeviceId             Uscita audio/cuffie dell'Interprete.
  interpreterMicrophoneId    Microfono per il riconoscimento Kroko.
  hideProjectionTitlebar     Nasconde la barra del titolo della
                             finestra di proiezione (true/false).
  Queste preferenze sono normalmente gestite dall'interfaccia.
  Gli identificativi audio possono cambiare da un PC all'altro.

config\voice-commands.json
  Contiene le frasi riconosciute e le relative sostituzioni.
  Ogni voce contiene "t" (frase pronunciata) e "r" (testo inserito).
  Esempio: {"t": "punto fermo", "r": ". "}
  Si puo' modificare anche dalla finestra "Comandi vocali".

config\kroko.json
  Regola la segmentazione del riconoscimento vocale. I valori sono
  espressi in SECONDI:

  {
    "rule1MinTrailingSilence": 1.5,
    "rule2MinTrailingSilence": 0.65,
    "rule3MinUtteranceLength": 20
  }

  rule1MinTrailingSilence
    Durata del silenzio necessaria a chiudere un segmento quando il
    riconoscitore non ha ancora prodotto parole.
    Diminuirla puo' provocare piu' chiusure durante le pause; aumentarla
    fa attendere piu' a lungo prima di considerare concluso il segmento.

  rule2MinTrailingSilence
    Durata del silenzio necessaria a chiudere un segmento dopo che
    il riconoscitore ha prodotto delle parole.
    Diminuirla rende piu' rapida la comparsa del testo definitivo,
    ma puo' spezzare una frase in piu' segmenti.
    Aumentarla lascia piu' tempo per continuare la frase, ma ritarda
    la finalizzazione quando ci si ferma.

  rule3MinUtteranceLength
    Durata massima di un segmento prima di forzarne la chiusura,
    anche se non c'e' una pausa sufficiente.
    Diminuirla produce segmenti piu' brevi; aumentarla consente
    segmenti piu' lunghi. Non accelera il calcolo del modello.

  Queste tre soglie NON modificano la velocita' di inferenza:
  modificano soltanto quando il testo viene considerato definitivo.
  Il testo provvisorio puo' comparire prima della finalizzazione.

  Per provarne altri valori:
    1. Interrompere il riconoscimento nell'applicazione.
    2. Modificare config\kroko.json con un editor di testo.
    3. Salvare un JSON valido, mantenendo i numeri senza virgolette.
    4. Riavviare il riconoscimento: le nuove soglie saranno lette
       all'inizio della sessione, senza riavviare SA.DIT.

  I valori devono essere maggiori di zero e non superiori a 120.
  Se il file non e' valido, Kroko segnala un errore.

DIAGNOSTICA DEL RICONOSCIMENTO
------------------------------

Durante le prove, l'Interprete salva automaticamente due file:
  logs\\kroko-final-segments.txt
  logs\\kroko-debug.jsonl

Il primo contiene SOLO i risultati definitivi di Kroko, uno per riga,
nel loro ordine originale. Non vengono eseguiti trim, sostituzioni delle
keyword o correzioni di punteggiatura. Spazi iniziali e finali sono
conservati. Solo eventuali ritorni a capo interni e backslash vengono
rappresentati con sequenze escape, per mantenere una riga per segmento.
Il file si accumula nelle sessioni successive: eliminarlo o rinominarlo
prima di una nuova prova permette di ottenere un corpus separato.

Il secondo file contiene la diagnostica dettagliata:

Ogni riga contiene un evento con data/ora. In particolare:
  model-ready   Modello caricato e pronto; tempo di inizializzazione.
  first-audio   Arrivo dei primi campioni dal microfono.
  first-result  Tempo trascorso fino al primo risultato riconosciuto.
  asr-interim   Testo provvisorio grezzo di Kroko.
  asr-final     Segmento definitivo grezzo di Kroko.
  outgoing      Sottotitoli o comandi di sistema passati all'invio
                verso la Sala ("transcript" e "subtitle-clear").

I testi sono registrati senza eliminare eventuali spazi iniziali
o finali. Il file permette di confrontare il riconoscimento con i
sottotitoli effettivamente trasmessi e di studiare la punteggiatura.

Attenzione: il log contiene il testo pronunciato. Non condividerlo
senza aver verificato l'assenza di informazioni riservate.
Il file puo' essere eliminato dopo i test.

NOTE D'USO
----------

- Il software necessita del runtime Microsoft WebView2 su Windows.
- Per il riconoscimento integrato, autorizzare l'uso del microfono.
- Non eseguire SA.DIT.exe direttamente dall'archivio compresso.
- Per trasportare le proprie impostazioni su un altro PC, copiare
  l'intera cartella, inclusa "config".
- Il PIN serve per abbinare i due computer: non e' una password
  e non sostituisce un sistema di autenticazione.
- Non diffondere archivi che contengano credenziali TURN riservate.

CREDITI
-------

Kroko ASR (modello italiano Community):
https://kroko.ai/
https://huggingface.co/Banafo/Kroko-ASR

Il modello Community e' ridistribuito con attribuzione e secondo
le condizioni della sua licenza Creative Commons BY-SA.
Le informazioni di attribuzione sono nella cartella "licenses".

Motore di inferenza sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx
