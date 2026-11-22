# ────────────────────────────────────────────────────────────
# gunicorn.conf.py — wird von gunicorn automatisch aus dem
# Arbeitsverzeichnis gelesen. Deshalb braucht es hierfuer KEINE
# Aenderung am Startbefehl im render-Dashboard.
# ────────────────────────────────────────────────────────────

# gunicorn 27 oeffnet neu einen Steuerungs-Socket unter ~/.gunicorn/gunicorn.ctl,
# ueber den sich der laufende Server fernsteuern laesst. In 23.0.0 gab es das
# nicht. Wir benutzen ihn nicht — und was wir nicht benutzen, muss auch nicht
# offen stehen. Die Rechte waeren zwar 0600 (nur der eigene Benutzer), aber in
# einem Container laeuft alles unter demselben Benutzer.
control_socket_disable = True

# Ein Prozess, mehrere Threads. Vorher lief EIN synchroner Worker: eine einzige
# haengende oder langsame Anfrage hielt alle anderen auf (im Audit lokal 30
# Sekunden lang). Mit Threads bedient der Prozess mehrere Anfragen zugleich.
#
# Bewusst EIN Prozess: die Flutbremse zaehlt im Arbeitsspeicher. Mehrere
# Prozesse haetten je ihre eigene Zaehlung und die Grenzen vervielfacht. Darum
# steht "workers" hier fest, statt einer Umgebungsvariablen zu folgen.
#
# Threads brauchen eine Vorsichtsmassnahme, die im Code steht: eine Live-Runde
# wird mit Zeilensperre geladen (_mutate_session), sonst koennten sich zwei
# gleichzeitige Schlaege gegenseitig ueberschreiben.
workers = 1
worker_class = "gthread"
threads = 24
timeout = 30
