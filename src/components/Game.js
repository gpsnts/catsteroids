import React, { useRef, useEffect, useState } from 'react';
import './Game.css';

/**
 * Função utilitária para gerar um número aleatório entre min e max.
 * @param {*} min Valor mínimo
 * @param {*} max Valor máximo
 * @returns Número aleatório entre min e max
 */
const rand = (min, max) => Math.random() * (max - min) + min;

/**
 * Função de wrap para garantir que as coordenadas da nave, balas e asteroides se mantenham dentro dos limites do canvas.
 * @param {*} v Valor a ser ajustado
 * @param {*} max Valor máximo (largura ou altura do canvas)
 * @returns
 */
function wrap(v, max) {
  if (v < 0) return v + max;
  if (v > max) return v - max;
  return v;
}

// Componente principal do jogo, responsável por toda a lógica, renderização e controle do estado do jogo.
// Utiliza um canvas para renderizar a nave, asteroides, balas e explosões,
// além de gerenciar o score, vidas e o estado de game over.
// O componente também lida com os inputs do teclado e toque para controlar a nave.
export default function Game() {
  const canvasRef = useRef(null);

  // Scores
  const scoreRef = useRef(0);
  const [, setScoreState] = useState(0); // used to trigger re-renders when score changes
  const [highscore, setHighscore] = useState(() => {
    const v = parseInt(localStorage.getItem('highscore') || '0', 10);
    return Number.isNaN(v) ? 0 : v;
  });

  // Estado do jogo e vidas do jogador
  const livesRef = useRef(3);
  const [gameOver, setGameOver] = useState(false);

  // Refs
  const shipRef = useRef(null);
  const bulletsRef = useRef([]);
  const asteroidsRef = useRef([]);
  const explosionsRef = useRef([]);
  const keysRef = useRef({});
  const invulnerableRef = useRef(false);
  const rafIdRef = useRef(null);

  // Loop de início do jogo, configuração do canvas e lógica principal
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    function onResize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', onResize);

    /**
     * Estado inicial para o jogo: nave centralizada, sem balas ou asteroides, score e vidas resetados
     */
    function initGame() {
      shipRef.current = { x: w / 2, y: h / 2, r: 12, a: 0, rot: 0, thrust: 0, vx: 0, vy: 0 };
      bulletsRef.current.length = 0;
      asteroidsRef.current.length = 0;
      explosionsRef.current.length = 0;
      scoreRef.current = 0;
      setScoreState(0);
      livesRef.current = 3;
      invulnerableRef.current = false;
      spawnAsteroids(6);
      setGameOver(false);
    }

    /**
     * Função para gerar asteroides aleatórios, garantindo que não apareçam muito próximos da nave ou de outros asteroides. Tenta posicionar cada asteroide até 80 vezes antes de forçar um spawn aleatório.
     * @param {*} n Número opcional de asteroides a gerar. Se não for fornecido, gera entre 4 e 8 asteroides.
     */
    function spawnAsteroids(n) {
      const count = typeof n === 'number' ? n : Math.floor(rand(4, 9));
      for (let i = 0; i < count; i++) {
        let tries = 0;
        let placed = false;
        while (!placed && tries < 80) {
          const r = rand(20, 60);
          const x = rand(0, w);
          const y = rand(0, h);
          const ship = shipRef.current;
          const dShip = Math.hypot(x - ship.x, y - ship.y);
          if (dShip < r + ship.r + 120) { tries++; continue; }
          let ok = true;
          for (const other of asteroidsRef.current) {
            if (Math.hypot(x - other.x, y - other.y) < r + other.r + 8) { ok = false; break; }
          }
          if (ok) {
            asteroidsRef.current.push({ x, y, r, vx: rand(-1.2, 1.2), vy: rand(-1.2, 1.2), rot: rand(-0.02, 0.02), hue: Math.floor(rand(0, 360)) });
            placed = true;
          }
          tries++;
        }
        if (!placed) asteroidsRef.current.push({ x: rand(0, w), y: rand(0, h), r: rand(20, 60), vx: rand(-1.2, 1.2), vy: rand(-1.2, 1.2) });
      }
    }

    initGame();

    // Faz o spawn de novos asteroides a cada 7-11 segundos, mas apenas se o jogo não tiver acabado
    const spawnInterval = setInterval(() => {
      if (!gameOver) spawnAsteroids(Math.floor(rand(1, 3)));
    }, 7000 + Math.floor(rand(0, 4000)));

    // Inputs
    function keyDown(e) {
      if (e.code === 'KeyR') {
        restart();
        return;
      }
      keysRef.current[e.code] = true;
      if (e.code === 'Space' && !gameOver) {
        const ship = shipRef.current;
        bulletsRef.current.push({ x: ship.x + Math.cos(ship.a) * ship.r, y: ship.y + Math.sin(ship.a) * ship.r, vx: ship.vx + Math.cos(ship.a) * 6, vy: ship.vy + Math.sin(ship.a) * 6, life: 60 });
      }
    }
    function keyUp(e) { keysRef.current[e.code] = false; }
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    // Handler para criar explosões quando a nave colide com um asteroide
    function spawnExplosion(x, y) {
      explosionsRef.current.push({ x, y, t: 0, ttl: 40 });
    }

    let last = performance.now();

    /**
     * Função principal de atualização do jogo, chamada a cada frame.
     * Atualiza a posição e estado da nave, balas, asteroides e explosões, além de lidar com colisões e pontuação.
     * A nave tem um período de invulnerabilidade após colidir com um asteroide, durante o qual não pode ser destruída novamente.
     * @param {*} dt Delta time desde a última atualização, usado para garantir movimento suave e consistente independentemente da taxa de quadros.
     */
    function update(dt) {
      const ship = shipRef.current;
      if (!ship) return;

      // Controles (teclado e touch) para rotação e thrust da nave
      const keys = keysRef.current;
      if (keys['ArrowLeft'] || keys['KeyA']) ship.rot = -0.12;
      else if (keys['ArrowRight'] || keys['KeyD']) ship.rot = 0.12;
      else ship.rot = 0;

      ship.a += ship.rot * dt * 0.06;
      ship.thrust = keys['ArrowUp'] || keys['KeyW'] ? 0.12 : 0;

      ship.vx += Math.cos(ship.a) * ship.thrust * dt * 0.02;
      ship.vy += Math.sin(ship.a) * ship.thrust * dt * 0.02;
      ship.vx *= 0.996;
      ship.vy *= 0.996;
      ship.x += ship.vx * dt * 0.06;
      ship.y += ship.vy * dt * 0.06;

      ship.x = wrap(ship.x, w);
      ship.y = wrap(ship.y, h);

      // Munição das balas e movimentação, removendo balas que já passaram do tempo de vida
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const b = bulletsRef.current[i];
        b.x += b.vx * dt * 0.06;
        b.y += b.vy * dt * 0.06;
        b.life -= 1;
        if (b.life <= 0) bulletsRef.current.splice(i, 1);
      }

      // Asteroides: movimentação, colisões com balas e nave.
      for (let i = asteroidsRef.current.length - 1; i >= 0; i--) {
        const a = asteroidsRef.current[i];
        a.x += a.vx * dt * 0.06;
        a.y += a.vy * dt * 0.06;
        a.rot = (a.rot || 0) + (a.spin || 0.0005) * dt;
        a.x = wrap(a.x, w);
        a.y = wrap(a.y, h);

        // Colisoes com balas
        for (let j = bulletsRef.current.length - 1; j >= 0; j--) {
          const b = bulletsRef.current[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (Math.hypot(dx, dy) < a.r) {
            bulletsRef.current.splice(j, 1);
            if (a.r > 25) {
              const newR = a.r / 2;
              const ang = rand(0, Math.PI * 2);
              const dx2 = Math.cos(ang) * (newR + 8);
              const dy2 = Math.sin(ang) * (newR + 8);
              asteroidsRef.current.push({ x: a.x + dx2, y: a.y + dy2, r: newR, vx: rand(-2, 2), vy: rand(-2, 2), rot: rand(-0.02, 0.02), hue: a.hue });
              asteroidsRef.current.push({ x: a.x - dx2, y: a.y - dy2, r: newR, vx: rand(-2, 2), vy: rand(-2, 2), rot: rand(-0.02, 0.02), hue: a.hue });
            }
            asteroidsRef.current.splice(i, 1);
            scoreRef.current += 10;
            setScoreState((s) => s + 10);
            break;
          }
        }

        // Colisão com a nave (apenas se não estiver invulnerável)
        if (!invulnerableRef.current) {
          const dx = a.x - ship.x;
          const dy = a.y - ship.y;
          if (Math.hypot(dx, dy) < a.r + ship.r) {
            spawnExplosion(ship.x, ship.y);
            livesRef.current -= 1;
            if (livesRef.current <= 0) {
              setGameOver(true);
              if (scoreRef.current > highscore) {
                setHighscore(scoreRef.current);
                localStorage.setItem('highscore', String(scoreRef.current));
              }
            } else {
              invulnerableRef.current = true;
              const ship0 = shipRef.current;
              ship0.x = w / 2; ship0.y = h / 2; ship0.vx = ship0.vy = 0; ship0.a = 0;
              setTimeout(() => { invulnerableRef.current = false; }, 1500);
            }
            break;
          }
        }
      }

      // Atualização das explosões, removendo as que já passaram do tempo de vida
      for (let i = explosionsRef.current.length - 1; i >= 0; i--) {
        const ex = explosionsRef.current[i];
        ex.t += 1;
        if (ex.t > ex.ttl) explosionsRef.current.splice(i, 1);
      }
    }

    /**
     * Função de renderização do jogo, chamada a cada frame após a atualização.
     * Desenha a nave (como uma cabeça de gato), os asteroides (também como cabeças de gato),
     * as balas e as explosões, além do HUD com pontuação e vidas.
     */
    function draw() {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      const ship = shipRef.current;
      // Desenha a nave como uma cabeça de gato estilizada. Se a nave estiver com thrust ativo, também desenha uma chama saindo atrás dela.
      if (ship && !gameOver) {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.a);

        // Rosto
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, ship.r, 0, Math.PI * 2);
        ctx.fill();

        // Orelhas
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(-ship.r * 0.6, -ship.r * 0.6);
        ctx.lineTo(-ship.r * 0.2, -ship.r * 1.1);
        ctx.lineTo(0, -ship.r * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ship.r * 0.6, -ship.r * 0.6);
        ctx.lineTo(ship.r * 0.2, -ship.r * 1.1);
        ctx.lineTo(0, -ship.r * 0.6);
        ctx.closePath();
        ctx.fill();

        // Olhos e nariz
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-4, -2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-2, 6); ctx.lineTo(2, 6); ctx.closePath(); ctx.fill();

        // Bigodes
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(-14, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(-14, 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, 2); ctx.lineTo(14, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(14, 6); ctx.stroke();

        // Chama do thruster
        if (ship.thrust) {
          ctx.fillStyle = '#f90';
          ctx.beginPath(); ctx.ellipse(-ship.r - 6, 0, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // Asteroides de gatinho
      for (const a of asteroidsRef.current) {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot || 0);

        // Rosto
        ctx.fillStyle = `hsl(${a.hue || 30} 30% 70%)`;
        ctx.beginPath(); ctx.arc(0, 0, a.r, 0, Math.PI * 2); ctx.fill();

        // Orelhas
        ctx.fillStyle = `hsl(${a.hue || 30} 30% 60%)`;
        ctx.beginPath(); ctx.moveTo(-a.r * 0.6, -a.r * 0.6); ctx.lineTo(-a.r * 0.2, -a.r * 1.1); ctx.lineTo(0, -a.r * 0.6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(a.r * 0.6, -a.r * 0.6); ctx.lineTo(a.r * 0.2, -a.r * 1.1); ctx.lineTo(0, -a.r * 0.6); ctx.closePath(); ctx.fill();

        // Olhos
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-a.r * 0.28, -a.r * 0.1, Math.max(2, a.r * 0.12), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(a.r * 0.28, -a.r * 0.1, Math.max(2, a.r * 0.12), 0, Math.PI * 2); ctx.fill();

        // Nariz
        ctx.beginPath(); ctx.moveTo(0, a.r * 0.05); ctx.lineTo(-a.r * 0.06, a.r * 0.2); ctx.lineTo(a.r * 0.06, a.r * 0.2); ctx.closePath(); ctx.fill();

        // Bigodes
        ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, a.r * 0.03);
        ctx.beginPath(); ctx.moveTo(-a.r * 0.2, a.r * 0.18); ctx.lineTo(-a.r * 0.8, a.r * 0.12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.r * 0.2, a.r * 0.18); ctx.lineTo(a.r * 0.8, a.r * 0.12); ctx.stroke();
        ctx.restore();
      }

      // Municação das balas
      ctx.fillStyle = '#ffd';
      for (const b of bulletsRef.current) ctx.fillRect(b.x - 2, b.y - 2, 4, 4);

      // Explosões como círculos que crescem e desaparecem
      for (const ex of explosionsRef.current) {
        const p = ex.t / ex.ttl;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,160,0,${1 - p})`;
        ctx.arc(ex.x, ex.y, 6 + p * 40, 0, Math.PI * 2);
        ctx.fill();
      }

      // HUD
      ctx.fillStyle = '#fff';
      ctx.font = '16px monospace';
      ctx.fillText(`Score: ${scoreRef.current}`, 12, 20);
      ctx.fillText(`High: ${highscore}`, 12, 40);
      ctx.fillText(`Lives: ${livesRef.current}`, 12, 60);
    }

    /**
     * Loop principal do jogo, chamado a cada frame usando requestAnimationFrame.
     * Calcula o delta time desde a última atualização para garantir movimento suave e consistente, e chama as funções de update e draw.
     * @param {*} now
     */
    function loop(now) {
      const dt = now - last;
      last = now;
      if (!gameOver) update(dt);
      draw();
      rafIdRef.current = requestAnimationFrame(loop);
    }

    rafIdRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      clearInterval(spawnInterval);
    };
  }, [highscore, gameOver]);

  /**
   * Função para reiniciar o jogo
   */
  function restart() {
    scoreRef.current = 0;
    setScoreState(0);
    livesRef.current = 3;
    setGameOver(false);
    invulnerableRef.current = false;
    bulletsRef.current.length = 0;
    asteroidsRef.current.length = 0;
    explosionsRef.current.length = 0;
    const canvas = canvasRef.current;
    if (canvas) {
      const w = canvas.width;
      const h = canvas.height;
      if (shipRef.current) {
        shipRef.current.x = w / 2;
        shipRef.current.y = h / 2;
        shipRef.current.vx = 0;
        shipRef.current.vy = 0;
        shipRef.current.a = 0;
      }
      for (let i = 0; i < 6; i++) {
        asteroidsRef.current.push({ x: rand(0, w), y: rand(0, h), r: rand(20, 60), vx: rand(-1.2, 1.2), vy: rand(-1.2, 1.2), rot: rand(-0.02, 0.02), hue: Math.floor(rand(0, 360)) });
      }
    }
  }

  /**
   * Handler para os controles de toque, atualizando o estado das teclas correspondentes
   * quando os botões de controle são pressionados ou soltos.
   * Isso permite que os jogadores em dispositivos móveis controlem a nave usando os botões na tela.
   * @param {*} key
   * @param {*} v
   */
  function touchSet(key, v) { keysRef.current[key] = v; }

  /**
   * Renderiza o componente do jogo, incluindo o canvas para renderização do jogo, o HUD com
   * dicas de controle e os botões de controle de toque para dispositivos móveis.
   */
  return (
    <div className="game-root">
      <canvas ref={canvasRef} />

      <div className="hud-bottom">
        <div className="hint">Use Arrow keys / WASD, Space to shoot. Press R to restart.</div>
      </div>

      {/* touch controls */}
      <div className="touch-controls">
        <button className="tc left" onPointerDown={() => touchSet('ArrowLeft', true)} onPointerUp={() => touchSet('ArrowLeft', false)} onPointerLeave={() => touchSet('ArrowLeft', false)}>◀</button>
        <button className="tc thrust" onPointerDown={() => touchSet('ArrowUp', true)} onPointerUp={() => touchSet('ArrowUp', false)} onPointerLeave={() => touchSet('ArrowUp', false)}>▲</button>
        <button className="tc right" onPointerDown={() => touchSet('ArrowRight', true)} onPointerUp={() => touchSet('ArrowRight', false)} onPointerLeave={() => touchSet('ArrowRight', false)}>▶</button>
        <button className="tc shoot" onPointerDown={() => { touchSet('Space', true); setTimeout(() => touchSet('Space', false), 150); }}>●</button>
      </div>

      {gameOver && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>Game Over</h2>
            <p>Score: {scoreRef.current}</p>
            <p>Highscore: {highscore}</p>
            <div className="overlay-actions">
              <button onClick={restart}>Restart</button>
              <button onClick={() => { setGameOver(false); }}>Close</button>
            </div>
            <p className="small">Press R to restart</p>
          </div>
        </div>
      )}
    </div>
  );
}
