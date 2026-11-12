proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
# Se SOBRESCRIBE (no se acumula con $proxy_add_x_forwarded_for): la aplicación toma el primer valor
# para sus límites de tasa y no debe poder ser falseado desde fuera.
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_connect_timeout 5s;
proxy_read_timeout 60s;
