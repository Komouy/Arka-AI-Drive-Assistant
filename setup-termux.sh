#!/data/data/com.termux/files/usr/bin/bash

# =========================================================
#  ARKA — Android Termux Installer & Setup Script
# =========================================================

echo -e "\e[1;36m"
echo "   ___    ____    __ __   ___ "
echo "  / _ |  / _  |  / //_/  / _ |"
echo " / __ | / , _/  / ,<    / __ |  ARKA CLI for Android Termux"
echo "/_/ |_|/_/|_|  /_/|_|  /_/ |_|  Setup Installer"
echo -e "\e[0m"

TARGET_URL="$1"
if [ -z "$TARGET_URL" ]; then
  TARGET_URL="http://192.168.18.158:5000/api"
fi

echo -e "\e[32m[1/3] Checking Node.js...\e[0m"
if ! command -v node &> /dev/null; then
  echo "Installing nodejs in Termux..."
  pkg update -y && pkg install nodejs -y
else
  echo "Node.js is already installed ($(node -v))."
fi

echo -e "\e[32m[2/3] Setting up ~/.arkarc config...\e[0m"
cat <<EOF > ~/.arkarc
{
  "apiUrl": "$TARGET_URL"
}
EOF
echo "ARKA Core API target set to: $TARGET_URL"

echo -e "\e[32m[3/3] Creating global 'arka' command in Termux...\e[0m"
mkdir -p "$PREFIX/bin"
cp ./cli/bin/arka.js "$PREFIX/bin/arka"
chmod +x "$PREFIX/bin/arka"

echo -e "\n\e[1;32m✅ ARKA CLI installed successfully in Termux!\e[0m"
echo -e "You can now run directly from anywhere on your Android phone:"
echo -e "  \e[1;33marka status\e[0m"
echo -e "  \e[1;33marka ls\e[0m"
echo -e "  \e[1;33marka upload ~/storage/shared/Download/photo.jpg --inbox\e[0m"
echo -e "  \e[1;33marka prompt ls\e[0m"
