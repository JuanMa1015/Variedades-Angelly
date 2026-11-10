import { useEffect, useState } from 'react';

// Lee y escribe JSON en localStorage sin romper cuando no esta disponible
// (modo privado, almacenamiento bloqueado o entorno de pruebas).
const readJson = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: la funcion sigue operando solo en memoria.
  }
};

export const useStoredState = (key, initialValue) => {
  const [value, setValue] = useState(() => readJson(key, initialValue));

  useEffect(() => {
    writeJson(key, value);
  }, [key, value]);

  return [value, setValue];
};
