Feature: Gestion de clientes y fiados
  Como administrador de Variedades Angelly
  Quiero validar creacion de clientes y comportamiento de fiados
  Para mantener calidad funcional en las reglas del dominio

  Scenario: Crear cliente de forma exitosa
    Given un registro vacio de clientes
    When se crea un cliente con nombre "Ana" documento "1001" y limite de credito 60000
    Then el cliente queda registrado
    And el cliente registrado tiene documento "1001"

  Scenario: Error por documento duplicado
    Given un registro vacio de clientes
    And existe un cliente registrado con documento "1001"
    When se intenta crear un cliente con nombre "Luis" documento "1001" y limite de credito 40000
    Then se muestra un error de documento duplicado

  Scenario: Caso limite con credito en cero
    Given un registro vacio de clientes
    When se intenta crear un cliente con nombre "Pedro" documento "1002" y limite de credito 0
    Then se muestra un error de limite de credito invalido

  Scenario Outline: Registrar diferentes abonos y validar saldo pendiente
    Given existe un cliente con limite de credito de 60000
    And el cliente tiene una venta fiada de 7000
    When registra un abono de <monto_abono>
    Then el saldo pendiente del cliente es <saldo_esperado>

    Examples:
      | monto_abono | saldo_esperado |
      | 1000        | 6000           |
      | 2500        | 4500           |
      | 7000        | 0              |
