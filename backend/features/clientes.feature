Feature: Gestion de fiados de clientes
  Como administrador de Variedades Angelly
  Quiero registrar abonos de clientes fiados
  Para controlar el saldo pendiente de cada cuenta

  Background:
    Given existe un cliente con limite de credito de 60000
    And el cliente tiene una venta fiada de 7000

  Scenario Outline: Registrar diferentes abonos y validar saldo pendiente
    When registra un abono de <monto_abono>
    Then el saldo pendiente del cliente es <saldo_esperado>

    Examples:
      | monto_abono | saldo_esperado |
      | 1000        | 6000           |
      | 2500        | 4500           |
      | 7000        | 0              |
