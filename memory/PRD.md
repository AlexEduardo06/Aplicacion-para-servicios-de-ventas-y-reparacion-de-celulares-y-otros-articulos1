# PRD - Gestión Móvil

## Overview
Spanish mobile app (React Native/Expo) to manage a small phone shop: cash register, phone inventory, and repair services tracking.

## Currency
- Dominican Peso (RD$ / DOP)

## Auth
- No login (single-user, local-to-shop)

## Features
1. **Caja (Cash Register)** - `/(tabs)/index.tsx`
   - Today's balance, ingresos vs egresos
   - List of recent transactions with delete
   - Bottom sheet to create ingreso/egreso with category (venta/reparacion/compra/gasto/otro), amount, description
2. **Inventario** - `/(tabs)/inventario.tsx`
   - Phone CRUD (brand, model, IMEI, color, condition: nuevo/usado/reacondicionado, buy/sell price, stock, photo, status: disponible/vendido)
   - Search bar (brand/model/IMEI) and condition filter chips
   - Photo via expo-image-picker (base64)
3. **Reparaciones** - `/(tabs)/reparaciones.tsx`
   - Repairs CRUD (client name, phone, device, fault, cost, notes)
   - Status workflow: recibido → en_progreso → listo → entregado
   - Segmented control: Activas / Entregadas
   - Tap card to change status in a bottom sheet
4. **Más / Reportes** - `/(tabs)/mas.tsx`
   - 7-day and 30-day cash summary
   - Inventory counts (total/disponibles/vendidos)
   - Repair counts (total/activas/entregadas)

## Backend API (FastAPI + MongoDB)
All routes prefixed with `/api`:
- `GET/POST /transactions`, `DELETE /transactions/{id}`
- `GET /summary/today`, `GET /summary/range?days=N`
- `GET/POST /phones`, `PUT/DELETE /phones/{id}`
- `GET/POST /repairs`, `PUT/DELETE /repairs/{id}`

## Stack
- Frontend: Expo SDK 54, expo-router, @gorhom/bottom-sheet, expo-image-picker, @expo/vector-icons (Ionicons)
- Backend: FastAPI, Motor (async MongoDB)
- Design: Emerald green brand (#047857), clean iOS-native aesthetic
