:- ensure_loaded(juegos).
:- ensure_loaded(orden).

:- discontiguous llamada/1.
:- discontiguous oculta/1.
:- discontiguous tripla/1.
:- discontiguous escalera/1.
:- discontiguous quad/1.

%! llamada(+Juego) is nondet.
%* Relaciona llamadas válidas según los términos dedicados (chii, pon y kanA).
%* Requiere que los elementos del juego estén en orden.

%! oculta(+Juego) is nondet.
%* Relaciona juegos ocultos válidos según los términos dedicados (escC, triC y kanC).
%* Requiere que los elementos del juego estén en orden.

%! escalera(+Juego) is nondet.
%* Relaciona juegos que funcionen como escaleras (chii y escC).
%* Requiere que los elementos del juego estén en orden.

%! tripla(+Juego) is nondet.
%* Relaciona juegos que funcionen como triplas estrictas (pon, triC).
%* Requiere que los elementos del juego estén en orden.

%! quad(+Juego) is nondet.
%* Relaciona juegos que funcionen como quads (kanA y kanC).
%* Requiere que los elementos del juego estén en orden.

%! pierna(+Juego) is nondet.
%* Relaciona juegos que funcionen como triplas, estrictas o no (pon, triC, kanA y kanC).
%* Requiere que los elementos del juego estén en orden.

%* ===================== Pares =====================
par(pareja(F1, F2)) :- fichasDePareja(F1, F2), fichasEnOrden([F1, F2]).

%* ===================== Escaleras =====================
llamada(chii(F1, F2, F3)) :- fichasDeEscalera(F1, F2, F3), fichasEnOrden([F1, F2, F3]).
escalera(chii(F1, F2, F3)) :- fichasDeEscalera(F1, F2, F3), fichasEnOrden([F1, F2, F3]).

oculta(escC(F1, F2, F3)) :- fichasDeEscalera(F1, F2, F3), fichasEnOrden([F1, F2, F3]).
escalera(escC(F1, F2, F3)) :- fichasDeEscalera(F1, F2, F3), fichasEnOrden([F1, F2, F3]).

%* ===================== Triplas =====================
llamada(pon(F1, F2, F3)) :- fichasDeTripla(F1, F2, F3), fichasEnOrden([F1, F2, F3]).
tripla(pon(F1, F2, F3)) :- fichasDeTripla(F1, F2, F3), fichasEnOrden([F1, F2, F3]).

oculta(triC(F1, F2, F3)) :- fichasDeTripla(F1, F2, F3), fichasEnOrden([F1, F2, F3]).
tripla(triC(F1, F2, F3)) :- fichasDeTripla(F1, F2, F3), fichasEnOrden([F1, F2, F3]).

%* ===================== Quads =====================
oculta(kanC(F1, F2, F3, F4)) :- fichasDeTripla(F1, F2, F3), F4 === F1, fichasEnOrden([F1, F2, F3, F4]).
quad(kanC(F1, F2, F3, F4)) :- fichasDeTripla(F1, F2, F3), F4 === F1, fichasEnOrden([F1, F2, F3, F4]).

llamada(kanA(F1, F2, F3, F4)) :- fichasDeTripla(F1, F2, F3), F4 === F1, fichasEnOrden([F1, F2, F3, F4]).
quad(kanA(F1, F2, F3, F4)) :- fichasDeTripla(F1, F2, F3), F4 === F1, fichasEnOrden([F1, F2, F3, F4]).

pierna(J) :- tripla(J) ; quad(J).

%* ===================== Kokushi Musou (Thirteen Orphans) =====================
kokushi(Huerfanos) :- Huerfanos =.. [huerfanos | Fichas],
    % son catorce fichas ordenadas:
    length(Fichas, 14), fichasEnOrden(Fichas),
    % están todos los huérfanos:
    findall(F, noSimple(F), FichasHuerfanas),
    forall(member(Ficha, FichasHuerfanas), member(Ficha, Fichas)),
    % hay una repetida:
    select(FichaRepetida, Fichas, FichasSin1),
    member(FichaRepetida, FichasSin1). 

%! juego(+Juego) is nondet.
%* Relaciona juegos, tanto abiertos como cerrados. Es decir, aquella cosa de la que hacen falta
%* cuatro para ganar una mano. Un par NO es un juego.
%* Requiere que los elementos del juego estén en orden.
juego(J) :- escalera(J) ; pierna(J).

%! forma(+Forma) is nondet.
%* Relaciona formas. Una forma es la unidad en la que se descompone una mano para determinar cómo se ganó.
%* Por ejemplo, una mano estándar tiene cinco formas: un par y cuatro juegos.
forma(F) :- par(F) ; juego(F).