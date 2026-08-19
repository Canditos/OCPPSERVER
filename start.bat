@echo off
echo ============================================
echo  OCPP 1.6 Dashboard - Siemens VersiCharge
echo ============================================

echo.
echo [1/3] A instalar dependencias do backend...
cd backend
pip install -r requirements.txt --quiet

echo.
echo [2/3] A iniciar backend (porta 8000)...
start "OCPP Backend" cmd /k "python main.py"

echo.
echo [3/3] A instalar dependencias do frontend...
cd ..\frontend
call npm install --silent

echo.
echo A iniciar frontend (porta 5173)...
start "OCPP Frontend" cmd /k "npm run dev"

echo.
echo ============================================
echo  Backend  : http://localhost:8000
echo  Frontend : http://localhost:5173
echo  OCPP WS  : ws://localhost:8000/ocpp/{charger_id}
echo  API Docs : http://localhost:8000/docs
echo ============================================
cd ..
