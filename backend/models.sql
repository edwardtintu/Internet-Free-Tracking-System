CREATE TABLE IF NOT EXISTS packets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    speed REAL,
    satellites INTEGER,
    battery REAL,
    rssi INTEGER
);
