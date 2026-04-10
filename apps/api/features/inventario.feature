Feature: Control de inventario
  Como administrador de Variedades Angelly
  Quiero validar entradas y salidas de stock
  Para mantener niveles de inventario consistentes

  Scenario: Agregar stock de forma exitosa
    Given existe un producto "Arroz Diana 500g" con precio costo 2800 precio venta 3500 stock 10 y minimo 4
    When se agregan 5 unidades al inventario
    Then el stock actual del producto es 15

  Scenario: Error por ajuste que deja stock negativo
    Given existe un producto "Leche Entera 1L" con precio costo 3000 precio venta 3900 stock 2 y minimo 1
    When se descuentan 3 unidades del inventario
    Then se obtiene un error de stock insuficiente

  Scenario: Alerta de stock bajo el minimo
    Given existe un producto "Azucar 500g" con precio costo 2500 precio venta 3200 stock 3 y minimo 5
    Then el producto queda en alerta de stock bajo
