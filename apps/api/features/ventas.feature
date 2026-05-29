Feature: Ventas
  Como vendedor del sistema
  Quiero registrar ventas y fiados
  Para controlar el inventario y las cuentas por cobrar

  Background:
    Given el sistema esta listo con usuarios semilla
    And existen los siguientes productos:
      | nombre              | precio_costo | precio_venta | stock_actual | stock_minimo |
      | Arroz Diana 500g    | 2800         | 3500         | 40           | 10           |
      | Aceite Vegetal 1L   | 4500         | 5500         | 25           | 5            |

  Scenario: Vendedor crea venta de contado exitosamente
    Given estoy autenticado como "vendedor1" con password "ventas123"
    When creo una venta de contado con items:
      | producto_nombre   | cantidad |
      | Arroz Diana 500g  | 2        |
      | Aceite Vegetal 1L | 1        |
    Then la respuesta es 201
    And la venta tiene total 12500
    And el saldo pendiente es 0

  Scenario: Vendedor registra fiado de tienda
    Given estoy autenticado como "vendedor1" con password "ventas123"
    And existe un cliente de tienda:
      | nombre        | telefono_whatsapp |
      | Marta Diaz    | 3001234567        |
    When creo un fiado de tienda para "Marta Diaz" con items:
      | producto_nombre   | cantidad |
      | Arroz Diana 500g  | 3        |
    Then la respuesta es 201
    And la venta tiene origen "tienda"
    And el saldo pendiente es 10500

  Scenario: Vendedor no puede registrar fiado de cartera
    Given estoy autenticado como "vendedor1" con password "ventas123"
    And existe un cliente de cartera:
      | nombre        | documento | limite_credito |
      | Carlos Ruiz   | 10001     | 50000          |
    When intento crear un fiado de cartera para "Carlos Ruiz" con items:
      | producto_nombre   | cantidad |
      | Arroz Diana 500g  | 1        |
    Then la respuesta es 403
    And el detalle del error es "Solo admin puede registrar fiados de cartera"

  Scenario: Admin registra fiado de cartera exitosamente
    Given estoy autenticado como "angelly_admin" con password "cambiame123"
    And existe un cliente de cartera:
      | nombre        | documento | limite_credito |
      | Carlos Ruiz   | 10001     | 50000          |
    When creo un fiado de cartera para "Carlos Ruiz" con items:
      | producto_nombre   | cantidad |
      | Arroz Diana 500g  | 2        |
    Then la respuesta es 201
    And la venta tiene origen "cartera"
