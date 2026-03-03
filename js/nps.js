Chart.defaults.font.family = "'Outfit', sans-serif";
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
        Chart.defaults.plugins.tooltip.titleColor = '#f8fafc';
        Chart.defaults.plugins.tooltip.bodyColor = '#cbd5e1';

        // --- LIGAÇÃO À API ---
        const API_URL = "https://script.google.com/macros/s/AKfycbzr0go-Z0nSoGO1IWtnVHbbmHiwCJqAGIyoRAUTYrKJhIS7MP9BekAbXN8ZlBKgtNTi/exec";

        let chartEvolucao, chartNPS;
        let rawDataFav = [];
        let rawDataCer = [];
        let comentariosParaIAGlobal = []; // Adicione esta linha

        function extrairDataTratada(linha) {
            const chaves = Object.keys(linha);

            // Prioridade MÁXIMA para 'Data do Registro'
            const chaveData = chaves.find(k => {
                const kLimpo = k.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return kLimpo === 'DATA DO REGISTRO' || kLimpo === 'CARIMBO DE DATA/HORA' || kLimpo === 'TIMESTAMP';
            }) || chaves.find(k => {
                // Secundário (Rede de pesca): apenas se não achar a prioritária
                const kLimpo = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return kLimpo.includes('registro') || kLimpo.includes('carimbo');
            });

            if (chaveData && linha[chaveData]) {
                let dtRaw = linha[chaveData];
                let dataReal = new Date(dtRaw);

                if (isNaN(dataReal) && typeof dtRaw === 'string') {
                    let partes = dtRaw.split(/[\/\-]/);
                    if (partes.length >= 3) {
                        let dia = parseInt(partes[0], 10);
                        let mes = parseInt(partes[1], 10) - 1;
                        let ano = parseInt(partes[2].split(' ')[0], 10);
                        if (ano < 100) ano += 2000;
                        dataReal = new Date(ano, mes, dia);
                    }
                }
                if (!isNaN(dataReal)) return dataReal;
            }
            return null;
        }

        function prepararFiltrosEIniciar() {
            let mesesMap = new Map();

            const processarFiltro = (linha) => {
                let d = extrairDataTratada(linha);
                if (d) {
                    let kStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    const mesesLista = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                    let label = `${mesesLista[d.getMonth()]} ${d.getFullYear()}`;
                    mesesMap.set(kStr, label);
                }
            };

            rawDataFav.forEach(processarFiltro);
            rawDataCer.forEach(processarFiltro);

            // Ordena os meses do mais novo pro mais velho
            let asArray = Array.from(mesesMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

            const select = document.getElementById('filtro-mes');
            select.innerHTML = "";

            asArray.forEach(([valor, texto]) => {
                select.innerHTML += `<option value="${valor}">${texto}</option>`;
            });

            // Adiciona a opção "Ver Tudo" no final
            select.innerHTML += `<option value="todos">Histórico Completo (Tudo)</option>`;

            // Por padrão já nasce selecionada a primeira (Mês Mais Recente)
            if (asArray.length > 0) {
                select.value = asArray[0][0];
            }

            aplicarFiltroMes(); // Roda a métrica
        }

        function aplicarFiltroMes() {
            const selecao = document.getElementById('filtro-mes').value;
            let finalFav = rawDataFav;
            let finalCer = rawDataCer;

            // Se o usuário selecionou um mês específico, nós "filtramos" os dados antes de mandar pro cálculo
            if (selecao !== 'todos') {
                const passaNoCorte = (linha) => {
                    let d = extrairDataTratada(linha);
                    if (!d) return false;
                    let kStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    return kStr === selecao;
                }
                finalFav = rawDataFav.filter(passaNoCorte);
                finalCer = rawDataCer.filter(passaNoCorte);
            }

            // Avisa no título dos cards de IA qual mês estamos lendo
            const mesNomeado = selecao === 'todos' ? 'Período Completo' : document.querySelector(`#filtro-mes option[value="${selecao}"]`).innerText;
            document.querySelector('.chart-card[style*="var(--success)"] .card-header span').innerHTML = `<i class="ph-fill ph-sparkle" style="color: var(--success);"></i> Top 3 Pontos de Excelência (${mesNomeado})`;
            document.querySelector('.chart-card[style*="var(--danger)"] .card-header span').innerHTML = `<i class="ph-fill ph-warning-circle" style="color: var(--danger);"></i> Top 3 Alertas Críticos (${mesNomeado})`;

            // Agora envia para a processarMetricas apenas a fatia de dados daquele mês!
            processarMetricas(finalFav, finalCer);
        }

        function switchTab(tabId, element) {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            element.classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tabId).classList.add('active');
            const titles = { 'geral': 'Hub Institucional', 'fav': 'Análise FAV', 'cer': 'Análise CER IV' };
            document.getElementById('page-title').innerText = titles[tabId];
        }

        async function carregarDados(mes = null, ano = null, tokenManual = null) {
            document.getElementById('loading-overlay').classList.remove('hidden');

            const token = tokenManual || localStorage.getItem('token_nps');

            try {
                // Comunicação via API (GET)
                const res = await fetch(`${API_URL}?token=${token}&action=nps_data`);
                const dadosBanco = await res.json();

                // Verificação de erro vindo da API
                if (dadosBanco.erro) {
                    mostrarErro(dadosBanco.erro);
                    limparSessao();
                    return;
                }

                if (dadosBanco.result === "error") {
                    mostrarErro(dadosBanco.error || "Acesso negado");
                    limparSessao();
                    return;
                }

                // Se chegou aqui, o token é válido!
                localStorage.setItem('token_nps', token);
                document.getElementById('tela-autenticacao').style.display = 'none';
                document.getElementById('conteudo-dashboard').style.display = 'block';

                rawDataFav = dadosBanco.fav || [];
                rawDataCer = dadosBanco.cer || [];
                prepararFiltrosEIniciar();

                const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                document.getElementById('hora-atualizacao').innerHTML = `<strong style="color:var(--success)">SYNC OK: ${hora}</strong>`;
                document.getElementById('loading-overlay').classList.add('hidden');
                document.getElementById('page-title').innerText = "Hub Institucional";
            } catch (erro) {
                console.error(erro);
                document.getElementById('hora-atualizacao').innerHTML = `<strong style="color:var(--danger)">FALHA DE SYNC</strong>`;
                document.getElementById('loading-overlay').classList.add('hidden');
                if (tokenManual) mostrarErro("Erro de conexão com o servidor.");
            }
        }

        function processarMetricas(dadosFav, dadosCer) {
            const totalFav = dadosFav.length;
            const totalCer = dadosCer.length;
            const totalRespostas = totalFav + totalCer;

            let promotores = 0, passivos = 0, detratores = 0;
            let promotoresFav = 0, passivosFav = 0, detratoresFav = 0;
            let promotoresCer = 0, passivosCer = 0, detratoresCer = 0;
            let listaDetratores = [];
            let todosOsComentariosParaIA = [];
            let totalElogios = 0;

            // --- NOVA LÓGICA: Linha do Tempo (Agrupando por Mês/Ano real E Ordenação) ---
            let timelineFAV = {};
            let timelineCER = {};

            const registrarData = (linha, origem) => {
                let dataReal = extrairDataTratada(linha);

                let chaveMes = 'Sem Data'; // Padrão
                let chaveOrdenacao = '9999-99'; // Chave para jogar os 'Sem Data' pro final

                if (dataReal) {
                    const dia = String(dataReal.getDate()).padStart(2, '0');
                    const mesStr = String(dataReal.getMonth() + 1).padStart(2, '0');

                    // Rotulo visível (ex: "15/02")
                    chaveMes = `${dia}/${mesStr}`;
                    // Ordem Cronológica para o Gráfico (ex: "2024-02-15")
                    chaveOrdenacao = `${dataReal.getFullYear()}-${mesStr}-${dia}`;
                }

                // Inicializa se não existir
                if (!timelineFAV[chaveOrdenacao]) timelineFAV[chaveOrdenacao] = { rotulo: chaveMes, count: 0 };
                if (!timelineCER[chaveOrdenacao]) timelineCER[chaveOrdenacao] = { rotulo: chaveMes, count: 0 };

                if (origem === 'FAV') {
                    timelineFAV[chaveOrdenacao].count++;
                } else {
                    timelineCER[chaveOrdenacao].count++;
                }
            };

            function analisarPesquisa(linha, origem) {
                if (!linha || typeof linha !== 'object') return;

                // Registra mês para evolução
                registrarData(linha, origem);

                let valorNps = linha['NPS'];
                const limparTexto = (t) => t.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                if (valorNps === undefined) {
                    const chaves = Object.keys(linha);
                    const chaveEncontrada = chaves.find(k => {
                        const K = limparTexto(k);
                        return K.includes('NPS') || K.includes('SATISFA') || K.includes('NOTA') || K.includes('RECOMEND') || K.includes('ESCALA');
                    });
                    if (chaveEncontrada) valorNps = linha[chaveEncontrada];
                }

                const chaves = Object.keys(linha);
                const getVal = (termos) => {
                    const k = chaves.find(key => termos.some(t => key.toUpperCase().includes(t)));
                    return k ? linha[k] : "";
                };

                // Busca a coluna do prontuário (cobre as variações com e sem acento)
                const prontuarioPaciente = getVal(['PRONTUÁRIO', 'PRONTUARIO', 'PRONT']) || "Não Informado";

                // --- SISTEMA ROBUSTO DE BUSCA DE MOTIVO/SUGESTÃO ---
                let valorCapturado = "";

                // 1. Array de termos desejados, por ordem de prioridade
                const termosMotivo = [
                    'JUSTIFICATIVA',
                    'SUGESTOES/DETALHES',
                    'SUGESTAO/DETALHE',
                    'SUGESTAO',
                    'DETALHE',
                    'MOTIVO',
                    'COMENTARIO',
                    'OBSERV',
                    'RELATO',
                    'PORQUE'
                ];

                // 2. Procura em todas as chaves da linha qual bate melhor (ordem cronológica de prioridade)
                for (let termo of termosMotivo) {
                    let chaveDestaVez = chaves.find(k => {
                        let kLimpo = k.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        return kLimpo.includes(termo);
                    });

                    // 3. Se achou a coluna E o paciente de fato escreveu algo nela (não deixou vazio)
                    if (chaveDestaVez && linha[chaveDestaVez]) {
                        let textoResposta = linha[chaveDestaVez].toString().trim();
                        // 4. Critério anti-falso-positivo: se ele só digitou um "-" ou escreveu "ok", descarte e procure a próxima
                        if (textoResposta !== "" && textoResposta.length > 2) {
                            valorCapturado = textoResposta;
                            break; // Achou? Para o loop e salva.
                        }
                    }
                }

                const motivoNota = valorCapturado ? valorCapturado : "Sem detalhes/sugestões registradas.";

                // --- CAPTURA DINÂMICA TRATADA PELO BACKEND ---
                let txt1 = linha["IA_TEXTO_1"] ? linha["IA_TEXTO_1"].toString().trim() : "";
                let txt2 = linha["IA_TEXTO_2"] ? linha["IA_TEXTO_2"].toString().trim() : "";

                if (txt1.length > 5 && txt1.toLowerCase() !== "ok" && txt1.toLowerCase() !== "nada") {
                    todosOsComentariosParaIA.push(txt1);
                }
                if (txt2.length > 5 && txt2.toLowerCase() !== "ok" && txt2.toLowerCase() !== "nada") {
                    todosOsComentariosParaIA.push(txt2);
                }
                // ---------------------------------------------

                const destaque = getVal(['DESTAQUE', 'PROFISSIONAL', 'ELOGIO']);

                let notaFinal = NaN;
                if (valorNps !== null && valorNps !== undefined) {
                    if (typeof valorNps === 'number') notaFinal = valorNps;
                    else {
                        const match = valorNps.toString().match(/\d+/);
                        if (match) notaFinal = parseInt(match[0], 10);
                    }
                }

                if (!isNaN(notaFinal) && notaFinal >= 0 && notaFinal <= 10) {
                    if (notaFinal >= 9) {
                        promotores++;
                        if (origem === 'FAV') promotoresFav++; else promotoresCer++;
                    } else if (notaFinal >= 7) {
                        passivos++;
                        if (origem === 'FAV') passivosFav++; else passivosCer++;
                    } else {
                        detratores++;
                        if (origem === 'FAV') detratoresFav++; else detratoresCer++;
                        listaDetratores.push({ origem, paciente: prontuarioPaciente, nota: notaFinal, motivo: motivoNota });
                    }
                }

                if (destaque && destaque.toString().trim().length > 2) totalElogios++;
            }

            dadosFav.forEach(linha => analisarPesquisa(linha, "FAV"));
            dadosCer.forEach(linha => analisarPesquisa(linha, "CER"));

            const calcNPS = (p, pa, d) => { const total = p + pa + d; return total === 0 ? 0 : Math.round(((p - d) / total) * 100); };
            const animar = (id, valor) => { const el = document.getElementById(id); if (el) el.innerText = valor; };

            animar('kpi-nps-global', calcNPS(promotores, passivos, detratores));
            animar('kpi-total', totalRespostas);
            animar('kpi-elogios', totalElogios);
            animar('kpi-detratores', detratores);
            animar('kpi-nps-fav', calcNPS(promotoresFav, passivosFav, detratoresFav));
            animar('kpi-total-fav', totalFav);
            animar('kpi-nps-cer', calcNPS(promotoresCer, passivosCer, detratoresCer));
            animar('kpi-total-cer', totalCer);

            // Atualiza Tabela (Ultimos 5)
            const tbody = document.getElementById('tabela-detratores');
            tbody.innerHTML = "";
            if (listaDetratores.length === 0) {
                tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:20px; color:var(--success);'>Nenhum alerta vermelho.</td></tr>";
            } else {
                listaDetratores.slice(-6).reverse().forEach(d => {
                    const tagClass = d.origem === 'FAV' ? 'tag-fav' : 'tag-cer';
                    tbody.innerHTML += `<tr>
                        <td><span class="${tagClass}">${d.origem}</span></td>
                        <td>
                            <strong style="display: block; color: var(--text-muted); font-size: 12px; font-weight: 500;">
                                <i class="ph-fill ph-lock-key" style="vertical-align: middle;"></i> Identidade Preservada
                            </strong>
                            <span style="font-size: 14px; font-weight: 600; color: var(--text-main); margin-top: 2px; display: inline-block;">
                                Prontuário: ${d.paciente}
                            </span>
                        </td>
                        <td class="note-bad">${d.nota}</td>
                        <td style="color:var(--text-dim); font-size: 13px; max-width: 400px; line-height: 1.4;"><i>"${d.motivo}"</i></td>
                    </tr>`;
                });
            }

            // ATUALIZA GRÁFICO NPS (REAL)
            if (chartNPS) {
                const temDados = promotores > 0 || passivos > 0 || detratores > 0;
                chartNPS.data.datasets[0].data = temDados ? [promotores, passivos, detratores] : [0, 1, 0];
                chartNPS.data.datasets[0].backgroundColor = temDados ? ['#10b981', '#475569', '#f43f5e'] : ['#1e293b', '#1e293b', '#1e293b'];
                chartNPS.update();
            }

            // ATUALIZA GRÁFICO EVOLUÇÃO (LINHA DO TEMPO REAL ORDENADA)
            if (chartEvolucao) {
                // Pega todas as chaves de ordenação e ordena cronologicamente
                let chavesOrdenadas = Array.from(new Set([...Object.keys(timelineFAV), ...Object.keys(timelineCER)])).sort();

                if (chavesOrdenadas.length === 0 || (chavesOrdenadas.length === 1 && chavesOrdenadas[0] === '9999-99')) {
                    // Módulo fall-back caso não ache datas válidas
                    chartEvolucao.data.labels = ['Amostra Única (Histórico sem Data)'];
                    chartEvolucao.data.datasets[0].data = [totalFav];
                    chartEvolucao.data.datasets[1].data = [totalCer];
                } else {
                    // Filtra o 'Sem Data' (9999-99) se ele não for o único dado, para não quebrar o visual da linha do tempo
                    if (chavesOrdenadas.length > 1) {
                        chavesOrdenadas = chavesOrdenadas.filter(k => k !== '9999-99');
                    }

                    // Extrai os rótulos bonitos (Ex: "Jan 24") na ordem correta
                    chartEvolucao.data.labels = chavesOrdenadas.map(k => {
                        return (timelineFAV[k] ? timelineFAV[k].rotulo : timelineCER[k].rotulo) || 'Desc';
                    });

                    // Preenche os pontos do gráfico na mesma ordem
                    chartEvolucao.data.datasets[0].data = chavesOrdenadas.map(k => timelineFAV[k] ? timelineFAV[k].count : 0);
                    chartEvolucao.data.datasets[1].data = chavesOrdenadas.map(k => timelineCER[k] ? timelineCER[k].count : 0);
                }
                chartEvolucao.update();
            }

            // --- PREPARAÇÃO DA IA (AGUARDANDO CLIQUE) ---
            comentariosParaIAGlobal = todosOsComentariosParaIA; // Salva para o botão usar

            const listaElogios = document.getElementById('ia-elogios');
            const listaCriticas = document.getElementById('ia-criticas');
            const btnIA = document.getElementById('btn-gerar-ia');

            if (listaElogios && listaCriticas) {
                listaElogios.innerHTML = '<li style="list-style: none; color: var(--text-muted);">Clique no botão acima para analisar os relatos.</li>';
                listaCriticas.innerHTML = '<li style="list-style: none; color: var(--text-muted);">Clique no botão acima para analisar os relatos.</li>';
            }

            if (btnIA) {
                btnIA.disabled = false;
                btnIA.innerHTML = '<i class="ph-fill ph-magic-wand"></i> Gerar Insights com IA';
            }
        }

        function solicitarAnaliseIA() {
            const listaElogios = document.getElementById('ia-elogios');
            const listaCriticas = document.getElementById('ia-criticas');
            const btnIA = document.getElementById('btn-gerar-ia');

            if (!comentariosParaIAGlobal || comentariosParaIAGlobal.length === 0) {
                listaElogios.innerHTML = '<li style="list-style:none;">Sem volume de texto suficiente neste período.</li>';
                listaCriticas.innerHTML = '<li style="list-style:none;">Sem volume de texto suficiente neste período.</li>';
                return;
            }

            btnIA.disabled = true;
            btnIA.innerHTML = '<div class="spinner-ring" style="width:14px; height:14px; border-width:2px; display:inline-block; vertical-align:middle; margin-right:8px; margin-bottom:0; animation: spin 1s linear infinite;"></div> Processando...';

            listaElogios.innerHTML = '<li style="list-style: none;"><div class="spinner-ring" style="width:14px; height:14px; border-width:2px; display:inline-block; vertical-align:middle; margin-right:8px; margin-bottom:0;"></div> Lendo e interpretando relatos...</li>';
            listaCriticas.innerHTML = '<li style="list-style: none;"><div class="spinner-ring" style="width:14px; height:14px; border-width:2px; display:inline-block; vertical-align:middle; margin-right:8px; margin-bottom:0;"></div> Lendo e interpretando relatos...</li>';

            // Prepara os dados para enviar à API
            const payload = {
                action: 'ia_insights',
                comentarios: comentariosParaIAGlobal
            };

            // Comunicação via API (POST)
            const token = localStorage.getItem('token_nps');
            fetch(`${API_URL}?token=${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8' // <--- ADICIONE ESTA LINHA PARA EVITAR BLOQUEIO CORS
                },
                body: JSON.stringify(payload)
            })
                .then(res => res.json())
                .then(respostaIA => {
                    listaElogios.innerHTML = "";
                    listaCriticas.innerHTML = "";
                    btnIA.innerHTML = '<i class="ph-fill ph-check-circle"></i> Análise Concluída';

                    if (respostaIA.elogios && respostaIA.elogios.length > 0) {
                        respostaIA.elogios.forEach(item => listaElogios.innerHTML += `<li>${item}</li>`);
                    } else {
                        listaElogios.innerHTML = '<li style="list-style:none;">Sem padrões de elogios neste período.</li>';
                    }

                    if (respostaIA.criticas && respostaIA.criticas.length > 0) {
                        respostaIA.criticas.forEach(item => listaCriticas.innerHTML += `<li>${item}</li>`);
                    } else {
                        listaCriticas.innerHTML = '<li style="list-style:none;">Sem padrões críticos neste período.</li>';
                    }
                })
                .catch(erro => {
                    btnIA.disabled = false;
                    btnIA.innerHTML = '<i class="ph-fill ph-warning"></i> Falha. Tentar Novamente';
                    listaElogios.innerHTML = '<li style="list-style:none; color: var(--warning);">Falha ao contatar o motor de IA.</li>';
                    listaCriticas.innerHTML = '<li style="list-style:none; color: var(--warning);">Falha ao contatar o motor de IA.</li>';
                });
        }

        window.onload = function () {

            // Gráfico NPS 
            chartNPS = new Chart(document.getElementById('chartNPS'), {
                type: 'doughnut',
                data: {
                    labels: ['Promotores', 'Passivos', 'Detratores'],
                    datasets: [{ data: [0, 1, 0], backgroundColor: ['#1e293b', '#1e293b', '#1e293b'], borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, color: '#94a3b8' } } } }
            });

            // Gráfico Evolução (PANORÂMICO)
            chartEvolucao = new Chart(document.getElementById('chartEvolucao'), {
                type: 'line',
                data: {
                    labels: ['Carregando Mapeamento...'],
                    datasets: [
                        { label: 'FAV', data: [0], borderColor: '#3b82f6', tension: 0.3, fill: true, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 3 },
                        { label: 'CER IV', data: [0], borderColor: '#8b5cf6', tension: 0.3, fill: true, backgroundColor: 'rgba(139, 92, 246, 0.1)', borderWidth: 3 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: 'top', align: 'end', labels: { color: '#f8fafc', usePointStyle: true, boxWidth: 8 } } },
                    scales: { x: { grid: { display: false } }, y: { border: { display: false }, grid: { color: 'rgba(255, 255, 255, 0.05)' } } }
                }
            });

            setTimeout(() => {
                // Ao carregar a página, verifica se já existe um token salvo
                const tokenSalvo = localStorage.getItem('token_nps');
                if (tokenSalvo) {
                    carregarDados(null, null, tokenSalvo);
                } else {
                    document.getElementById('tela-autenticacao').style.display = 'flex';
                }
            }, 500);
        };

        // --- LÓGICA DE AUTENTICAÇÃO ---
        function validarEEntrar() {
            const tokenDigitado = document.getElementById('input-token').value;
            if (!tokenDigitado) {
                mostrarErro("Por favor, digite o token.");
                return;
            }
            document.getElementById('msg-erro').style.display = 'none';
            document.getElementById('btn-login').innerText = 'Validando...';
            carregarDados(null, null, tokenDigitado);
        }

        function mostrarErro(mensagem) {
            const divErro = document.getElementById('msg-erro');
            divErro.innerText = mensagem;
            divErro.style.display = 'block';
            document.getElementById('btn-login').innerText = 'Acessar Painel';
        }

        function limparSessao() {
            localStorage.removeItem('token_nps');
            document.getElementById('tela-autenticacao').style.display = 'flex';
            document.getElementById('conteudo-dashboard').style.display = 'none';
            document.getElementById('btn-login').innerText = 'Acessar Painel';
        }

        function sairDoPainel() {
            limparSessao();
            document.getElementById('input-token').value = '';
        }
