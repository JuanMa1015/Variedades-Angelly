Feature: Gestion de productos
  Como administrador
  Quiero gestionar el catalogo de productos
  Para mantener el inventario actualizado

  Background:
    Given el sistema esta listo con usuarios semilla
    And estoy autenticado como "angelly_admin" con password "cambiame123"

  Scenario: Crear un producto exitosamente
    When creo un producto con nombre "Arroz Diana 1kg" codigo_barras "7701234567890" precio_costo 3500 precio_venta 4500 stock_actual 50 stock_minimo 10 catalogo "tienda"
    Then la respuesta es 201
    And el producto "Arroz Diana 1kg" tiene precio_venta 4500

  Scenario: Error al crear producto con precio negativo
    When intento crear un producto con nombre "Producto Malo" codigo_barras "7709999999999" precio_costo -1000 precio_venta 2000 stock_actual 10 stock_minimo 5 catalogo "tienda"
    Then la respuesta es 422

  Scenario: Actualizar precio de venta de un producto
    Given existe un producto:
      | nombre        | precio_costo | precio_venta | stock_actual | stock_minimo | codigo_barras | catalogo |
      | Leche Colanta | 2500         | 3200         | 30           | 5            | 7701234567891 | tienda   |
    When actualizo el precio del producto "Leche Colanta" a 3500
    Then la respuesta es 200
    And el producto "Leche Colanta" tiene precio_venta 3500

  Scenario: Eliminar un producto
    Given existe un producto:
      | nombre     | precio_costo | precio_venta | stock_actual | stock_minimo | codigo_barras | catalogo |
      | Producto X | 1000         | 2000         | 10           | 2            | 7701234567892 | tienda   |
    When elimino el producto "Producto X"
    Then la respuesta es 204
