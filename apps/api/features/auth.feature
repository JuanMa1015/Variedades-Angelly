Feature: Autenticacion
  Como usuario del sistema
  Quiero iniciar sesion con mis credenciales
  Para acceder a los modulos segun mi rol

  Background:
    Given el sistema esta listo con usuarios semilla

  Scenario: Login exitoso como admin
    When hago login con usuario "angelly_admin" y password "cambiame123"
    Then la respuesta es 200
    And el token tiene rol "admin"
    And el username es "angelly_admin"

  Scenario: Login exitoso como vendedor
    When hago login con usuario "vendedor1" y password "ventas123"
    Then la respuesta es 200
    And el token tiene rol "vendedor"

  Scenario: Login con credenciales invalidas
    When hago login con usuario "angelly_admin" y password "clave_mala"
    Then la respuesta es 401
    And el detalle del error es "Credenciales invalidas"

  Scenario: Acceso a endpoint sin token
    When hago GET a "/api/clientes/cartera" sin token
    Then la respuesta es 401

  Scenario: Vendedor no puede acceder a cartera
    Given estoy autenticado como "vendedor1" con password "ventas123"
    When hago GET a "/api/clientes/cartera"
    Then la respuesta es 403
