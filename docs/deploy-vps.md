# Развёртывание на VPS с Nginx и HTTPS

Итоговая схема: браузер → Nginx с HTTPS → Docker-контейнер на `127.0.0.1:3000`. Nginx также проксирует WebSocket `/ws`.

## 1. Подготовьте адрес и сервер

- Создайте A-запись домена на публичный IP VPS.
- Установите Docker Engine и Docker Compose plugin.
- Убедитесь, что сертификат содержит полный домен и Nginx может читать `fullchain.pem` и `privkey.pem`.
- В firewall разрешите 80 и 443. Порт 3000 наружу открывать не нужно.

## 2. Получите проект и задайте секрет

```bash
git clone https://github.com/Fears0ff/DnD-WormsBoard.git
cd DnD-WormsBoard
cp .env.example .env
openssl rand -hex 32
```

Вставьте полученную случайную строку в `.env` вместо `replace-with-a-long-random-secret`. Не публикуйте этот файл.

## 3. Запустите приложение

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/api/health
```

Ожидаемый ответ:

```json
{"ok":true,"status":"ok"}
```

Compose публикует порт только на `127.0.0.1`. База, изображения и резервные копии хранятся в именованном томе `dnd-board-data`.

## 4. Настройте Nginx

В репозитории есть шаблон `deploy/nginx.conf`. Замените в нём все `dnd.example.com` на свой домен и укажите реальные пути сертификатов.

Для стандартной конфигурации Debian/Ubuntu:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/dnd-board
sudo nano /etc/nginx/sites-available/dnd-board
sudo ln -s /etc/nginx/sites-available/dnd-board /etc/nginx/sites-enabled/dnd-board
sudo nginx -t
sudo systemctl reload nginx
```

Если серверный блок для HTTP на порту 80 уже существует, объедините redirect с текущей конфигурацией, а не создавайте дублирующий блок.

Обязательные параметры уже включены в шаблон: `Host`, `X-Forwarded-Proto`, `X-Forwarded-For`, `Upgrade`, `Connection`, увеличенный лимит загрузки и timeout для WebSocket.

## 5. Проверьте публичный сайт

```bash
curl https://ВАШ-ДОМЕН/api/health
```

Откройте `https://ВАШ-ДОМЕН/`. После регистрации откроется главная страница с кнопками «Мир» и «Доска». Первый зарегистрированный пользователь становится мастером. При первом открытии «Мира» мастером автоматически создаётся и наполняется «Прайм».

## Обновление

```bash
cd DnD-WormsBoard
git pull
docker compose up -d --build
```

Перед обновлением сделайте резервную копию данных. Не выполняйте `docker compose down -v`: флаг `-v` удаляет том.

## Диагностика

```bash
docker compose logs --tail=200 dnd-board
docker compose ps
curl -i http://127.0.0.1:3000/api/health
sudo nginx -t
sudo tail -n 100 /var/log/nginx/error.log
```

Если API работает локально, но HTTPS недоступен, проверяйте DNS, сертификат и Nginx. Если сайт открывается, но realtime отключается, проверяйте заголовки `Upgrade` и `Connection` в конфигурации Nginx.
