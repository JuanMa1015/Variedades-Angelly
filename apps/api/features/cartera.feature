Feature: Cartera
  Como administrador del sistema
  Quiero gestionar abonos y validar reglas de cartera
  Para mantener el control de las cuentas por cobrar

  Background:
    Given el sistema esta listo con usuarios semilla
    Given estoy autenticado como "angelly_admin" con password "cambiame123"

  Scenario: Admin registra un abono exitosamente
    Given existe un cliente de cartera:
      | nombre      | documento | limite_credito |
      | Carlos Ruiz | 10001     | 50000          |
    And el cliente "Carlos Ruiz" tiene una deuda de 15000
    When registro un abono de 5000 para "Carlos Ruiz"
    Then la respuesta es 201
    And el saldo del cliente "Carlos Ruiz" es 10000

  Scenario: Abono no puede superar la deuda actual
    Given existe un cliente de cartera:
      | nombre      | documento | limite_credito |
      | Maria Lopez | 10002     | 30000          |
    And el cliente "Maria Lopez" tiene una deuda de 8000
    When intento registrar un abono de 10000 para "Maria Lopez"
    Then la respuesta es 400
    And el detalle del error es "El abono supera la deuda actual del cliente"
