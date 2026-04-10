Feature: Registro de ventas
  Como operador de caja
  Quiero registrar ventas de contado y fiado
  Para garantizar calculos correctos de stock y credito

  Scenario: Registrar venta de contado
    Given un producto para venta "Arroz Diana 500g" con precio costo 2800 precio venta 3500 y stock 10
    When se registra una venta de contado por 2 unidades
    Then el total de la venta registrada es 7000
    And el stock del producto en venta es 8

  Scenario: Registrar venta fiada (happy path)
    Given un cliente de ventas "Dona Marta" con limite 20000 y deuda actual 0
    And un producto para venta "Leche Entera 1L" con precio costo 3000 precio venta 4000 y stock 8
    When se registra una venta fiada por 2 unidades
    Then la venta fiada se registra correctamente
    And la deuda del cliente de ventas es 8000
    And el stock del producto en venta es 6

  Scenario: Error por limite de credito excedido
    Given un cliente de ventas "Dona Marta" con limite 10000 y deuda actual 9000
    And un producto para venta "Leche Entera 1L" con precio costo 3000 precio venta 2000 y stock 8
    When se intenta registrar una venta fiada por 1 unidades
    Then se obtiene un error por limite de credito excedido
    And el stock del producto en venta es 8
