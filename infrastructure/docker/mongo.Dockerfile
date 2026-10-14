# UNTESTED. Thin wrapper so the DB image/version is pinned in one place.
FROM mongo:7.0
EXPOSE 27017
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD mongosh --quiet --eval "db.adminCommand('ping').ok" || exit 1
