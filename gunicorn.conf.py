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
